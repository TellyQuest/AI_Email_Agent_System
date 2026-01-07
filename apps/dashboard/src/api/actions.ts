import { get, post } from './client';
import type { Action, ActionWithContext, PaginatedResponse, StatusCounts, ActionStatus, RiskLevel } from '@/types';

export interface ActionFilters {
  status?: ActionStatus;
  emailId?: string;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
  limit?: number;
  offset?: number;
}

export async function getActions(filters: ActionFilters = {}): Promise<PaginatedResponse<Action>> {
  return get<PaginatedResponse<Action>>('/actions', {
    ...filters,
    requiresApproval: filters.requiresApproval?.toString(),
  });
}

export async function getAction(id: string): Promise<ActionWithContext> {
  return get<ActionWithContext>(`/actions/${id}`);
}

export async function getPendingActions(): Promise<{ data: Action[]; total: number }> {
  return get<{ data: Action[]; total: number }>('/actions/pending');
}

export async function getActionStats(): Promise<StatusCounts> {
  return get<StatusCounts>('/actions/stats/status');
}

export async function approveAction(id: string, approverId: string): Promise<Action> {
  return post<Action>(`/actions/${id}/approve`, { approverId });
}

export async function rejectAction(id: string, rejectedBy: string, reason: string): Promise<Action> {
  return post<Action>(`/actions/${id}/reject`, { rejectedBy, reason });
}
