import { Result } from '@ai-email-agent/utils';
import { EmailDomain, ClientMatch } from '../types/email.js';
import { ClientDomain, ClientEmailMapping } from '../types/client.js';

// Matching errors
export const MatchErrorCode = {
  DATABASE_ERROR: 'DATABASE_ERROR',
  LLM_ERROR: 'LLM_ERROR',
  NO_CANDIDATES: 'NO_CANDIDATES',
  AMBIGUOUS: 'AMBIGUOUS',
} as const;
export type MatchErrorCode = (typeof MatchErrorCode)[keyof typeof MatchErrorCode];

export interface MatchError {
  code: MatchErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Matcher service interface
export interface IClientMatcherService {
  /**
   * Attempt to match an email to a client
   */
  match(email: EmailDomain): Promise<Result<ClientMatch, MatchError>>;

  /**
   * Learn a new mapping from human correction
   */
  learnMapping(
    emailAddress: string,
    clientId: string,
    createdBy?: string
  ): Promise<Result<ClientEmailMapping, MatchError>>;

  /**
   * Get all mappings for a client
   */
  getMappings(clientId: string): Promise<Result<ClientEmailMapping[], MatchError>>;

  /**
   * Delete a mapping
   */
  deleteMapping(mappingId: string): Promise<Result<void, MatchError>>;
}

// Matching options
export interface MatchOptions {
  // Use LLM for content-based matching if other methods fail
  useLLMFallback?: boolean;
  // Minimum confidence for auto-match
  minConfidence?: number;
  // Maximum number of candidates to return
  maxCandidates?: number;
  // Include inactive clients
  includeInactive?: boolean;
}
