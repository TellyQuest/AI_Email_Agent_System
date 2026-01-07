import { useQuery } from '@tanstack/react-query';
import * as api from '@/api/dashboard';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: api.getDashboardSummary,
    refetchInterval: 30000,
  });
}

export function useDashboardActivity(hours = 24) {
  return useQuery({
    queryKey: ['dashboard', 'activity', hours],
    queryFn: () => api.getDashboardActivity(hours),
    refetchInterval: 30000,
  });
}

export function usePendingReviews(limit = 20) {
  return useQuery({
    queryKey: ['dashboard', 'reviews', limit],
    queryFn: () => api.getPendingReviews(limit),
    refetchInterval: 30000,
  });
}

export function useAuditLog(entityType: 'email' | 'action' | 'saga', entityId: string | undefined) {
  return useQuery({
    queryKey: ['audit', entityType, entityId],
    queryFn: () => api.getAuditLog(entityType, entityId!),
    enabled: !!entityId,
  });
}
