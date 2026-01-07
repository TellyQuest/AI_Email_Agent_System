import { eq, and, desc, inArray } from 'drizzle-orm';
import { ok, err, Result } from '@ai-email-agent/utils';
import { getDb } from '../db.js';
import { sagas, Saga, NewSaga, SagaStatus, SagaStepDefinition } from '../schema/sagas.js';

export interface SagaFilters {
  status?: SagaStatus | SagaStatus[];
  emailId?: string;
  limit?: number;
  offset?: number;
}

export class SagaRepository {
  private db = getDb();

  async create(saga: NewSaga): Promise<Result<Saga, Error>> {
    try {
      const [created] = await this.db.insert(sagas).values(saga).returning();
      if (!created) {
        return err(new Error('Failed to create saga'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(id: string): Promise<Result<Saga | null, Error>> {
    try {
      const [saga] = await this.db.select().from(sagas).where(eq(sagas.id, id)).limit(1);
      return ok(saga ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByEmailId(emailId: string): Promise<Result<Saga[], Error>> {
    try {
      const result = await this.db
        .select()
        .from(sagas)
        .where(eq(sagas.emailId, emailId))
        .orderBy(desc(sagas.createdAt));
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findMany(filters: SagaFilters = {}): Promise<Result<Saga[], Error>> {
    try {
      const conditions = [];

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          conditions.push(inArray(sagas.status, filters.status));
        } else {
          conditions.push(eq(sagas.status, filters.status));
        }
      }

      if (filters.emailId) {
        conditions.push(eq(sagas.emailId, filters.emailId));
      }

      let query = this.db
        .select()
        .from(sagas)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(sagas.createdAt));

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

  async updateStatus(id: string, status: SagaStatus): Promise<Result<Saga, Error>> {
    try {
      const updates: Partial<Saga> = {
        status,
        updatedAt: new Date(),
      };

      switch (status) {
        case 'running':
          updates.startedAt = new Date();
          break;
        case 'completed':
          updates.completedAt = new Date();
          break;
        case 'failed':
          updates.failedAt = new Date();
          break;
        case 'compensated':
          updates.compensatedAt = new Date();
          break;
      }

      const [updated] = await this.db
        .update(sagas)
        .set(updates)
        .where(eq(sagas.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Saga not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async advanceStep(id: string): Promise<Result<Saga, Error>> {
    try {
      const [saga] = await this.db.select().from(sagas).where(eq(sagas.id, id)).limit(1);

      if (!saga) {
        return err(new Error(`Saga not found: ${id}`));
      }

      const nextStep = (saga.currentStep ?? 0) + 1;
      const isComplete = nextStep >= saga.totalSteps;

      const [updated] = await this.db
        .update(sagas)
        .set({
          currentStep: nextStep,
          status: isComplete ? 'completed' : saga.status,
          completedAt: isComplete ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(sagas.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Failed to advance saga: ${id}`));
      }

      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateSteps(id: string, steps: SagaStepDefinition[]): Promise<Result<Saga, Error>> {
    try {
      const [updated] = await this.db
        .update(sagas)
        .set({
          steps,
          updatedAt: new Date(),
        })
        .where(eq(sagas.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Saga not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async markFailed(id: string, error: string): Promise<Result<Saga, Error>> {
    try {
      const [updated] = await this.db
        .update(sagas)
        .set({
          status: 'failed',
          error,
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sagas.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Saga not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findPendingCompensation(): Promise<Result<Saga[], Error>> {
    try {
      const result = await this.db
        .select()
        .from(sagas)
        .where(eq(sagas.status, 'compensating'))
        .orderBy(sagas.failedAt);
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const sagaRepository = new SagaRepository();
