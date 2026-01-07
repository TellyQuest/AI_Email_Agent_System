import { eq, and } from 'drizzle-orm';
import { ok, err, Result } from '@ai-email-agent/utils';
import { getDb } from '../db.js';
import { attachments, Attachment, NewAttachment } from '../schema/attachments.js';

export class AttachmentRepository {
  private db = getDb();

  async create(attachment: NewAttachment): Promise<Result<Attachment, Error>> {
    try {
      const [created] = await this.db.insert(attachments).values(attachment).returning();
      if (!created) {
        return err(new Error('Failed to create attachment'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async createMany(attachmentList: NewAttachment[]): Promise<Result<Attachment[], Error>> {
    try {
      if (attachmentList.length === 0) {
        return ok([]);
      }
      const created = await this.db.insert(attachments).values(attachmentList).returning();
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(id: string): Promise<Result<Attachment | null, Error>> {
    try {
      const [attachment] = await this.db
        .select()
        .from(attachments)
        .where(eq(attachments.id, id))
        .limit(1);
      return ok(attachment ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByEmailId(emailId: string): Promise<Result<Attachment[], Error>> {
    try {
      const result = await this.db
        .select()
        .from(attachments)
        .where(eq(attachments.emailId, emailId));
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByContentHash(contentHash: string): Promise<Result<Attachment | null, Error>> {
    try {
      const [attachment] = await this.db
        .select()
        .from(attachments)
        .where(eq(attachments.contentHash, contentHash))
        .limit(1);
      return ok(attachment ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateExtractionStatus(
    id: string,
    status: string,
    extractedText?: string
  ): Promise<Result<Attachment, Error>> {
    try {
      const [updated] = await this.db
        .update(attachments)
        .set({
          extractionStatus: status,
          extractedText,
        })
        .where(eq(attachments.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Attachment not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async delete(id: string): Promise<Result<void, Error>> {
    try {
      await this.db.delete(attachments).where(eq(attachments.id, id));
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async deleteByEmailId(emailId: string): Promise<Result<void, Error>> {
    try {
      await this.db.delete(attachments).where(eq(attachments.emailId, emailId));
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const attachmentRepository = new AttachmentRepository();
