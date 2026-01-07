import { eq, and, desc, sql, inArray, isNull, lt, gte } from 'drizzle-orm';
import { ok, err, Result } from '@ai-email-agent/utils';
import { getDb } from '../db.js';
import {
  emails,
  Email,
  NewEmail,
  EmailStatus,
  ClassificationData,
  ExtractedData,
  MatchMethod,
} from '../schema/emails.js';

export interface EmailFilters {
  status?: EmailStatus | EmailStatus[];
  clientId?: string | null;
  senderEmail?: string;
  receivedAfter?: Date;
  receivedBefore?: Date;
  limit?: number;
  offset?: number;
}

export class EmailRepository {
  private db = getDb();

  async create(email: NewEmail): Promise<Result<Email, Error>> {
    try {
      const [created] = await this.db.insert(emails).values(email).returning();
      if (!created) {
        return err(new Error('Failed to create email'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(id: string): Promise<Result<Email | null, Error>> {
    try {
      const [email] = await this.db.select().from(emails).where(eq(emails.id, id)).limit(1);
      return ok(email ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByMessageId(messageId: string): Promise<Result<Email | null, Error>> {
    try {
      const [email] = await this.db
        .select()
        .from(emails)
        .where(eq(emails.messageId, messageId))
        .limit(1);
      return ok(email ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findMany(filters: EmailFilters = {}): Promise<Result<Email[], Error>> {
    try {
      const conditions = [];

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          conditions.push(inArray(emails.status, filters.status));
        } else {
          conditions.push(eq(emails.status, filters.status));
        }
      }

      if (filters.clientId !== undefined) {
        if (filters.clientId === null) {
          conditions.push(isNull(emails.clientId));
        } else {
          conditions.push(eq(emails.clientId, filters.clientId));
        }
      }

      if (filters.senderEmail) {
        conditions.push(eq(emails.senderEmail, filters.senderEmail));
      }

      if (filters.receivedAfter) {
        conditions.push(gte(emails.receivedAt, filters.receivedAfter));
      }

      if (filters.receivedBefore) {
        conditions.push(lt(emails.receivedAt, filters.receivedBefore));
      }

      let query = this.db
        .select()
        .from(emails)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(emails.receivedAt));

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

  async updateStatus(id: string, status: EmailStatus): Promise<Result<Email, Error>> {
    try {
      const [updated] = await this.db
        .update(emails)
        .set({
          status,
          updatedAt: new Date(),
          ...(status === 'completed' ? { processedAt: new Date() } : {}),
        })
        .where(eq(emails.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Email not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateClassification(
    id: string,
    classification: ClassificationData
  ): Promise<Result<Email, Error>> {
    try {
      const [updated] = await this.db
        .update(emails)
        .set({
          classification,
          status: 'classified',
          updatedAt: new Date(),
        })
        .where(eq(emails.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Email not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateClientMatch(
    id: string,
    clientId: string | null,
    matchMethod: MatchMethod,
    matchConfidence: number
  ): Promise<Result<Email, Error>> {
    try {
      const [updated] = await this.db
        .update(emails)
        .set({
          clientId,
          matchMethod,
          matchConfidence: String(matchConfidence),
          status: 'matched',
          updatedAt: new Date(),
        })
        .where(eq(emails.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Email not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateExtractedData(
    id: string,
    extractedData: ExtractedData
  ): Promise<Result<Email, Error>> {
    try {
      const [updated] = await this.db
        .update(emails)
        .set({
          extractedData,
          status: 'extracted',
          updatedAt: new Date(),
        })
        .where(eq(emails.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Email not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async exists(messageId: string): Promise<Result<boolean, Error>> {
    try {
      const result = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(eq(emails.messageId, messageId));
      const row = result[0];
      return ok(row ? row.count > 0 : false);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async countByStatus(): Promise<Result<Record<EmailStatus, number>, Error>> {
    try {
      const result = await this.db
        .select({
          status: emails.status,
          count: sql<number>`count(*)::int`,
        })
        .from(emails)
        .groupBy(emails.status);

      const counts = {} as Record<EmailStatus, number>;
      for (const row of result) {
        counts[row.status as EmailStatus] = row.count;
      }
      return ok(counts);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getClientSummary(clientId: string, days: number = 30): Promise<Result<{
    emails: Email[];
    stats: {
      total: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      totalAmount: number;
      pendingAmount: number;
    };
  }, Error>> {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const clientEmails = await this.db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.clientId, clientId),
            gte(emails.receivedAt, sinceDate)
          )
        )
        .orderBy(desc(emails.receivedAt));

      // Calculate statistics
      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      let totalAmount = 0;
      let pendingAmount = 0;

      for (const email of clientEmails) {
        // Count by type
        const emailType = (email.classification as ClassificationData | null)?.emailType ?? 'unknown';
        byType[emailType] = (byType[emailType] ?? 0) + 1;

        // Count by status
        byStatus[email.status] = (byStatus[email.status] ?? 0) + 1;

        // Sum amounts from extracted data
        const amount = parseFloat((email.extractedData as ExtractedData | null)?.amount?.value ?? '0') || 0;
        totalAmount += amount;

        if (email.status !== 'completed' && email.status !== 'archived') {
          pendingAmount += amount;
        }
      }

      return ok({
        emails: clientEmails,
        stats: {
          total: clientEmails.length,
          byType,
          byStatus,
          totalAmount,
          pendingAmount,
        },
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const emailRepository = new EmailRepository();
