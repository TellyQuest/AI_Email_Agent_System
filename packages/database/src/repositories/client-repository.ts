import { eq, and, or, sql, ilike, arrayContains } from 'drizzle-orm';
import { ok, err, Result } from '@ai-email-agent/utils';
import { getDb } from '../db.js';
import {
  clients,
  clientEmailMappings,
  Client,
  NewClient,
  ClientEmailMapping,
  NewClientEmailMapping,
  PatternType,
} from '../schema/clients.js';

export interface ClientFilters {
  isActive?: boolean;
  quickbooksId?: string;
  billcomId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface MatchCandidate {
  client: Client;
  matchMethod: 'explicit' | 'domain' | 'vendor';
  confidence: number;
}

export class ClientRepository {
  private db = getDb();

  async create(client: NewClient): Promise<Result<Client, Error>> {
    try {
      const [created] = await this.db.insert(clients).values(client).returning();
      if (!created) {
        return err(new Error('Failed to create client'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(id: string): Promise<Result<Client | null, Error>> {
    try {
      const [client] = await this.db.select().from(clients).where(eq(clients.id, id)).limit(1);
      return ok(client ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByQuickbooksId(qbId: string): Promise<Result<Client | null, Error>> {
    try {
      const [client] = await this.db
        .select()
        .from(clients)
        .where(eq(clients.quickbooksId, qbId))
        .limit(1);
      return ok(client ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findMany(filters: ClientFilters = {}): Promise<Result<Client[], Error>> {
    try {
      const conditions = [];

      if (filters.isActive !== undefined) {
        conditions.push(eq(clients.isActive, filters.isActive));
      }

      if (filters.quickbooksId) {
        conditions.push(eq(clients.quickbooksId, filters.quickbooksId));
      }

      if (filters.billcomId) {
        conditions.push(eq(clients.billcomId, filters.billcomId));
      }

      if (filters.search) {
        conditions.push(
          or(
            ilike(clients.name, `%${filters.search}%`),
            ilike(clients.displayName, `%${filters.search}%`)
          )
        );
      }

      let query = this.db
        .select()
        .from(clients)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      if (filters.limit) {
        query = query.limit(filters.limit) as typeof query;
      }

      if (filters.offset) {
        query = query.offset(filters.offset) as typeof query;
      }

      const result = await query;
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async update(id: string, updates: Partial<NewClient>): Promise<Result<Client, Error>> {
    try {
      const [updated] = await this.db
        .update(clients)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Client not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Find client by email using explicit mappings first, then domain matching
  async findByEmail(email: string): Promise<Result<MatchCandidate[], Error>> {
    try {
      const candidates: MatchCandidate[] = [];
      const domain = email.split('@')[1]?.toLowerCase();

      // 1. Check explicit email mappings
      const exactMappings = await this.db
        .select()
        .from(clientEmailMappings)
        .innerJoin(clients, eq(clientEmailMappings.clientId, clients.id))
        .where(
          and(
            eq(clientEmailMappings.emailPattern, email.toLowerCase()),
            eq(clientEmailMappings.patternType, 'exact')
          )
        );

      for (const row of exactMappings) {
        candidates.push({
          client: row.clients,
          matchMethod: 'explicit',
          confidence: parseFloat(row.client_email_mappings.confidence ?? '1.0'),
        });
      }

      // 2. Check domain mappings
      if (domain) {
        const domainMappings = await this.db
          .select()
          .from(clientEmailMappings)
          .innerJoin(clients, eq(clientEmailMappings.clientId, clients.id))
          .where(
            and(
              eq(clientEmailMappings.emailPattern, domain),
              eq(clientEmailMappings.patternType, 'domain')
            )
          );

        for (const row of domainMappings) {
          candidates.push({
            client: row.clients,
            matchMethod: 'domain',
            confidence: parseFloat(row.client_email_mappings.confidence ?? '0.9'),
          });
        }

        // 3. Check client email domains array
        const domainClients = await this.db
          .select()
          .from(clients)
          .where(sql`${domain} = ANY(${clients.emailDomains})`);

        for (const client of domainClients) {
          // Avoid duplicates
          if (!candidates.some((c) => c.client.id === client.id)) {
            candidates.push({
              client,
              matchMethod: 'domain',
              confidence: 0.85,
            });
          }
        }
      }

      // Sort by confidence descending
      candidates.sort((a, b) => b.confidence - a.confidence);

      return ok(candidates);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Email mapping management
  async createEmailMapping(mapping: NewClientEmailMapping): Promise<Result<ClientEmailMapping, Error>> {
    try {
      const [created] = await this.db
        .insert(clientEmailMappings)
        .values({
          ...mapping,
          emailPattern: mapping.emailPattern.toLowerCase(),
        })
        .returning();
      if (!created) {
        return err(new Error('Failed to create email mapping'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findEmailMappings(clientId: string): Promise<Result<ClientEmailMapping[], Error>> {
    try {
      const mappings = await this.db
        .select()
        .from(clientEmailMappings)
        .where(eq(clientEmailMappings.clientId, clientId));
      return ok(mappings);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async deleteEmailMapping(id: string): Promise<Result<void, Error>> {
    try {
      await this.db.delete(clientEmailMappings).where(eq(clientEmailMappings.id, id));
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Learn from corrections
  async learnEmailMapping(
    email: string,
    clientId: string,
    createdBy?: string
  ): Promise<Result<ClientEmailMapping, Error>> {
    try {
      const [created] = await this.db
        .insert(clientEmailMappings)
        .values({
          emailPattern: email.toLowerCase(),
          clientId,
          patternType: 'exact',
          confidence: '1.0',
          source: 'learned',
          createdBy,
        })
        .onConflictDoUpdate({
          target: [clientEmailMappings.emailPattern, clientEmailMappings.patternType],
          set: {
            clientId,
            confidence: '1.0',
            source: 'learned',
            createdBy,
          },
        })
        .returning();
      if (!created) {
        return err(new Error('Failed to learn email mapping'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const clientRepository = new ClientRepository();
