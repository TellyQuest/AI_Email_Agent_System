import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/clients';

export function useClients(filters: api.ClientFilters = {}) {
  return useQuery({
    queryKey: ['clients', filters],
    queryFn: () => api.getClients(filters),
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.getClient(id!),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.createClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<api.CreateClientInput> }) =>
      api.updateClient(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useClientMappings(id: string | undefined) {
  return useQuery({
    queryKey: ['clients', id, 'mappings'],
    queryFn: () => api.getClientMappings(id!),
    enabled: !!id,
  });
}

export function useLearnMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ emailAddress, clientId }: { emailAddress: string; clientId: string }) =>
      api.learnMapping(emailAddress, clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
