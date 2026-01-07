import { get } from './client';
import type { DashboardSummary, DashboardActivity, AuditEvent, Action } from '@/types';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return get<DashboardSummary>('/dashboard/summary');
}

export async function getDashboardActivity(hours = 24): Promise<DashboardActivity> {
  return get<DashboardActivity>('/dashboard/activity', { hours });
}

export async function getPendingReviews(limit = 20): Promise<{ reviews: Action[]; total: number }> {
  return get<{ reviews: Action[]; total: number }>('/dashboard/reviews', { limit });
}

export async function getAuditLog(
  entityType: 'email' | 'action' | 'saga',
  entityId: string
): Promise<{ events: AuditEvent[] }> {
  return get<{ events: AuditEvent[] }>(`/dashboard/audit/${entityType}/${entityId}`);
}
