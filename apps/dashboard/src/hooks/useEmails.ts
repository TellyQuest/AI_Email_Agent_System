import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/emails';
import type { EmailStatus } from '@/types';

export function useEmails(filters: api.EmailFilters = {}) {
  return useQuery({
    queryKey: ['emails', filters],
    queryFn: () => api.getEmails(filters),
  });
}

export function useEmail(id: string | undefined) {
  return useQuery({
    queryKey: ['emails', id],
    queryFn: () => api.getEmail(id!),
    enabled: !!id,
  });
}

export function useEmailStats() {
  return useQuery({
    queryKey: ['emails', 'stats'],
    queryFn: api.getEmailStats,
  });
}

export function useUpdateEmailStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EmailStatus }) =>
      api.updateEmailStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });
}
