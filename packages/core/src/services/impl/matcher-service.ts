import { Result, ok, err, createLogger } from '@ai-email-agent/utils';
import { ClientRepository, MatchCandidate } from '@ai-email-agent/database';
import { EmailDomain, ClientMatch, MatchMethod } from '../../types/email.js';
import { ClientEmailMapping } from '../../types/client.js';
import {
  IClientMatcherService,
  MatchError,
  MatchErrorCode,
  MatchOptions,
} from '../matcher.js';

const logger = createLogger({ service: 'matcher-service' });

/**
 * Convert repository match method to domain match method
 */
function toMatchMethod(method: 'explicit' | 'domain' | 'vendor'): MatchMethod {
  const methodMap: Record<string, MatchMethod> = {
    explicit: 'explicit',
    domain: 'domain',
    vendor: 'vendor',
  };
  return methodMap[method] ?? 'unmatched';
}

/**
 * Service implementation for matching emails to clients
 */
export class ClientMatcherService implements IClientMatcherService {
  constructor(
    private clientRepo: ClientRepository,
    private options: MatchOptions = {}
  ) {}

  /**
   * Attempt to match an email to a client based on sender email
   */
  async match(email: EmailDomain): Promise<Result<ClientMatch, MatchError>> {
    logger.info(
      { emailId: email.id, senderEmail: email.senderEmail },
      'Attempting to match email to client'
    );

    // Get candidates from repository
    const candidatesResult = await this.clientRepo.findByEmail(email.senderEmail);

    if (!candidatesResult.ok) {
      logger.error({ error: candidatesResult.error }, 'Database error during client match');
      return err({
        code: MatchErrorCode.DATABASE_ERROR,
        message: candidatesResult.error.message,
        details: { emailId: email.id },
      });
    }

    const candidates = candidatesResult.value;
    const minConfidence = this.options.minConfidence ?? 0.7;
    const maxCandidates = this.options.maxCandidates ?? 5;

    // Filter by minimum confidence
    const qualifiedCandidates = candidates.filter((c) => c.confidence >= minConfidence);

    // No candidates found
    if (qualifiedCandidates.length === 0) {
      logger.info(
        { emailId: email.id, totalCandidates: candidates.length },
        'No matching clients found above confidence threshold'
      );
      return ok({
        matchMethod: 'unmatched',
        clientId: null,
        confidence: 0,
        candidates: candidates.slice(0, maxCandidates).map((c) => ({
          clientId: c.client.id,
          clientName: c.client.name,
          matchMethod: toMatchMethod(c.matchMethod),
          confidence: c.confidence,
        })),
      });
    }

    // Check for ambiguous match (multiple high-confidence candidates)
    const highConfidenceCandidates = qualifiedCandidates.filter((c) => c.confidence >= 0.9);
    if (highConfidenceCandidates.length > 1) {
      logger.warn(
        { emailId: email.id, candidateCount: highConfidenceCandidates.length },
        'Ambiguous match - multiple high-confidence candidates'
      );
      // Don't error, but return as unmatched with candidates
      return ok({
        matchMethod: 'unmatched',
        clientId: null,
        confidence: 0,
        candidates: qualifiedCandidates.slice(0, maxCandidates).map((c) => ({
          clientId: c.client.id,
          clientName: c.client.name,
          matchMethod: toMatchMethod(c.matchMethod),
          confidence: c.confidence,
        })),
      });
    }

    // Return best match
    const bestMatch = qualifiedCandidates[0]!;
    logger.info(
      {
        emailId: email.id,
        clientId: bestMatch.client.id,
        clientName: bestMatch.client.name,
        method: bestMatch.matchMethod,
        confidence: bestMatch.confidence,
      },
      'Client matched successfully'
    );

    return ok({
      matchMethod: toMatchMethod(bestMatch.matchMethod),
      clientId: bestMatch.client.id,
      confidence: bestMatch.confidence,
      candidates: qualifiedCandidates.slice(0, maxCandidates).map((c) => ({
        clientId: c.client.id,
        clientName: c.client.name,
        matchMethod: toMatchMethod(c.matchMethod),
        confidence: c.confidence,
      })),
    });
  }

  /**
   * Learn a new mapping from human correction
   */
  async learnMapping(
    emailAddress: string,
    clientId: string,
    createdBy?: string
  ): Promise<Result<ClientEmailMapping, MatchError>> {
    logger.info({ emailAddress, clientId, createdBy }, 'Learning new email mapping');

    const result = await this.clientRepo.learnEmailMapping(emailAddress, clientId, createdBy);

    if (!result.ok) {
      logger.error({ error: result.error }, 'Failed to learn email mapping');
      return err({
        code: MatchErrorCode.DATABASE_ERROR,
        message: result.error.message,
        details: { emailAddress, clientId },
      });
    }

    const mapping = result.value;
    logger.info({ mappingId: mapping.id }, 'Email mapping learned successfully');

    return ok({
      id: mapping.id,
      emailPattern: mapping.emailPattern,
      clientId: mapping.clientId,
      patternType: mapping.patternType as 'exact' | 'domain' | 'regex',
      confidence: parseFloat(mapping.confidence ?? '1.0'),
      source: mapping.source as 'manual' | 'learned' | 'imported',
      createdBy: mapping.createdBy ?? null,
      createdAt: mapping.createdAt ?? new Date(),
    });
  }

  /**
   * Get all mappings for a client
   */
  async getMappings(clientId: string): Promise<Result<ClientEmailMapping[], MatchError>> {
    logger.debug({ clientId }, 'Fetching email mappings for client');

    const result = await this.clientRepo.findEmailMappings(clientId);

    if (!result.ok) {
      return err({
        code: MatchErrorCode.DATABASE_ERROR,
        message: result.error.message,
        details: { clientId },
      });
    }

    return ok(
      result.value.map((m) => ({
        id: m.id,
        emailPattern: m.emailPattern,
        clientId: m.clientId,
        patternType: m.patternType as 'exact' | 'domain' | 'regex',
        confidence: parseFloat(m.confidence ?? '1.0'),
        source: m.source as 'manual' | 'learned' | 'imported',
        createdBy: m.createdBy ?? null,
        createdAt: m.createdAt ?? new Date(),
      }))
    );
  }

  /**
   * Delete a mapping
   */
  async deleteMapping(mappingId: string): Promise<Result<void, MatchError>> {
    logger.info({ mappingId }, 'Deleting email mapping');

    const result = await this.clientRepo.deleteEmailMapping(mappingId);

    if (!result.ok) {
      return err({
        code: MatchErrorCode.DATABASE_ERROR,
        message: result.error.message,
        details: { mappingId },
      });
    }

    return ok(undefined);
  }
}

/**
 * Create a matcher service instance with default repository
 */
export function createClientMatcherService(
  clientRepo?: ClientRepository,
  options?: MatchOptions
): ClientMatcherService {
  const { clientRepository } = require('@ai-email-agent/database');
  return new ClientMatcherService(clientRepo ?? clientRepository, options);
}
