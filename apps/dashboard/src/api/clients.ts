import { get, post, patch } from './client';
import type { Client, ClientEmailMapping, PaginatedResponse } from '@/types';

export interface ClientFilters {
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateClientInput {
  name: string;
  displayName?: string;
  quickbooksId?: string;
  billcomId?: string;
  emailDomains?: string[];
  knownEmails?: string[];
  keywords?: string[];
  defaultExpenseAccount?: string;
  approvalThreshold?: number;
  autoApproveVendors?: string[];
}

export async function getClients(filters: ClientFilters = {}): Promise<PaginatedResponse<Client>> {
  return get<PaginatedResponse<Client>>('/clients', {
    ...filters,
    isActive: filters.isActive?.toString(),
  });
}

export async function getClient(id: string): Promise<Client> {
  return get<Client>(`/clients/${id}`);
}

export async function createClient(data: CreateClientInput): Promise<Client> {
  return post<Client>('/clients', data);
}

export async function updateClient(id: string, data: Partial<CreateClientInput>): Promise<Client> {
  return patch<Client>(`/clients/${id}`, data);
}

export async function getClientMappings(id: string): Promise<{ data: ClientEmailMapping[] }> {
  return get<{ data: ClientEmailMapping[] }>(`/clients/${id}/mappings`);
}

export async function matchClient(email: string): Promise<{ candidates: Client[] }> {
  return get<{ candidates: Client[] }>('/clients/match', { email });
}

export async function learnMapping(emailAddress: string, clientId: string): Promise<ClientEmailMapping> {
  return post<ClientEmailMapping>('/clients/mappings/learn', { emailAddress, clientId });
}
