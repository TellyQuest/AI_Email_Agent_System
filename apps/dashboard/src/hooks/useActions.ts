import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/actions';

export function useActions(filters: api.ActionFilters = {}) {
  return useQuery({
    queryKey: ['actions', filters],
    queryFn: () => api.getActions(filters),
  });
}

export function useAction(id: string | undefined) {
  return useQuery({
    queryKey: ['actions', id],
    queryFn: () => api.getAction(id!),
    enabled: !!id,
  });
}

export function usePendingActions() {
  return useQuery({
    queryKey: ['actions', 'pending'],
    queryFn: api.getPendingActions,
  });
}

export function useActionStats() {
  return useQuery({
    queryKey: ['actions', 'stats'],
    queryFn: api.getActionStats,
  });
}

export function useApproveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, approverId }: { id: string; approverId: string }) =>
      api.approveAction(id, approverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRejectAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, rejectedBy, reason }: { id: string; rejectedBy: string; reason: string }) =>
      api.rejectAction(id, rejectedBy, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
