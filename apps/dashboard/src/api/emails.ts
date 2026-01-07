import { get, patch } from './client';
import type { Email, PaginatedResponse, StatusCounts, EmailStatus } from '@/types';

export interface EmailFilters {
  status?: EmailStatus;
  clientId?: string;
  senderEmail?: string;
  limit?: number;
  offset?: number;
}

export async function getEmails(filters: EmailFilters = {}): Promise<PaginatedResponse<Email>> {
  return get<PaginatedResponse<Email>>('/emails', filters as Record<string, string | number | boolean | undefined>);
}

export async function getEmail(id: string): Promise<Email> {
  return get<Email>(`/emails/${id}`);
}

export async function getEmailStats(): Promise<StatusCounts> {
  return get<StatusCounts>('/emails/stats/status');
}

export async function updateEmailStatus(id: string, status: EmailStatus): Promise<Email> {
  return patch<Email>(`/emails/${id}/status`, { status });
}
