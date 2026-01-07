import { eq, and, desc, sql, inArray, isNull } from 'drizzle-orm';
import { ok, err, Result } from '@ai-email-agent/utils';
import { getDb } from '../db.js';
import {
  actions,
  Action,
  NewAction,
  ActionStatus,
  ActionType,
  RiskLevel,
  ActionResult,
} from '../schema/actions.js';
import { emails } from '../schema/emails.js';
import { clients } from '../schema/clients.js';

export interface ActionFilters {
  status?: ActionStatus | ActionStatus[];
  emailId?: string;
  sagaId?: string;
  riskLevel?: RiskLevel | RiskLevel[];
  requiresApproval?: boolean;
  actionType?: ActionType | ActionType[];
  limit?: number;
  offset?: number;
}

export interface ActionWithContext extends Action {
  email?: typeof emails.$inferSelect;
  client?: typeof clients.$inferSelect | null;
}

export class ActionRepository {
  private db = getDb();

  async create(action: NewAction): Promise<Result<Action, Error>> {
    try {
      const [created] = await this.db.insert(actions).values(action).returning();
      if (!created) {
        return err(new Error('Failed to create action'));
      }
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async createMany(actionList: NewAction[]): Promise<Result<Action[], Error>> {
    try {
      const created = await this.db.insert(actions).values(actionList).returning();
      return ok(created);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(id: string): Promise<Result<Action | null, Error>> {
    try {
      const [action] = await this.db.select().from(actions).where(eq(actions.id, id)).limit(1);
      return ok(action ?? null);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByIdWithContext(id: string): Promise<Result<ActionWithContext | null, Error>> {
    try {
      const result = await this.db
        .select()
        .from(actions)
        .innerJoin(emails, eq(actions.emailId, emails.id))
        .leftJoin(clients, eq(emails.clientId, clients.id))
        .where(eq(actions.id, id))
        .limit(1);

      const row = result[0];
      if (!row) {
        return ok(null);
      }

      return ok({
        ...row.actions,
        email: row.emails,
        client: row.clients,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findMany(filters: ActionFilters = {}): Promise<Result<Action[], Error>> {
    try {
      const conditions = [];

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          conditions.push(inArray(actions.status, filters.status));
        } else {
          conditions.push(eq(actions.status, filters.status));
        }
      }

      if (filters.emailId) {
        conditions.push(eq(actions.emailId, filters.emailId));
      }

      if (filters.sagaId) {
        conditions.push(eq(actions.sagaId, filters.sagaId));
      }

      if (filters.riskLevel) {
        if (Array.isArray(filters.riskLevel)) {
          conditions.push(inArray(actions.riskLevel, filters.riskLevel));
        } else {
          conditions.push(eq(actions.riskLevel, filters.riskLevel));
        }
      }

      if (filters.requiresApproval !== undefined) {
        conditions.push(eq(actions.requiresApproval, filters.requiresApproval));
      }

      if (filters.actionType) {
        if (Array.isArray(filters.actionType)) {
          conditions.push(inArray(actions.actionType, filters.actionType));
        } else {
          conditions.push(eq(actions.actionType, filters.actionType));
        }
      }

      let query = this.db
        .select()
        .from(actions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(actions.createdAt));

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

  async findPendingApprovals(limit = 50): Promise<Result<ActionWithContext[], Error>> {
    try {
      const result = await this.db
        .select()
        .from(actions)
        .innerJoin(emails, eq(actions.emailId, emails.id))
        .leftJoin(clients, eq(emails.clientId, clients.id))
        .where(and(eq(actions.status, 'pending'), eq(actions.requiresApproval, true)))
        .orderBy(desc(actions.createdAt))
        .limit(limit);

      return ok(
        result.map((row) => ({
          ...row.actions,
          email: row.emails,
          client: row.clients,
        }))
      );
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateStatus(id: string, status: ActionStatus): Promise<Result<Action, Error>> {
    try {
      const [updated] = await this.db
        .update(actions)
        .set({
          status,
          updatedAt: new Date(),
          ...(status === 'completed' ? { executedAt: new Date() } : {}),
        })
        .where(eq(actions.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Action not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async approve(id: string, approvedBy: string): Promise<Result<Action, Error>> {
    try {
      const [updated] = await this.db
        .update(actions)
        .set({
          status: 'approved',
          approvedBy,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(actions.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Action not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async reject(id: string, rejectedBy: string, reason: string): Promise<Result<Action, Error>> {
    try {
      const [updated] = await this.db
        .update(actions)
        .set({
          status: 'rejected',
          rejectedBy,
          rejectedAt: new Date(),
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Action not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async markExecuted(
    id: string,
    result: ActionResult,
    externalId?: string
  ): Promise<Result<Action, Error>> {
    try {
      const [updated] = await this.db
        .update(actions)
        .set({
          status: result.success ? 'completed' : 'failed',
          result,
          externalId,
          executedAt: new Date(),
          error: result.error,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Action not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async markCompensated(id: string, compensationId?: string): Promise<Result<Action, Error>> {
    try {
      const [updated] = await this.db
        .update(actions)
        .set({
          status: 'compensated',
          isCompensated: true,
          compensatedAt: new Date(),
          compensationId,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, id))
        .returning();

      if (!updated) {
        return err(new Error(`Action not found: ${id}`));
      }
      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async countByStatus(): Promise<Result<Record<ActionStatus, number>, Error>> {
    try {
      const result = await this.db
        .select({
          status: actions.status,
          count: sql<number>`count(*)::int`,
        })
        .from(actions)
        .groupBy(actions.status);

      const counts = {} as Record<ActionStatus, number>;
      for (const row of result) {
        counts[row.status as ActionStatus] = row.count;
      }
      return ok(counts);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const actionRepository = new ActionRepository();
