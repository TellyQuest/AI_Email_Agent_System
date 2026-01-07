// Client domain types

// Client domain object
export interface ClientDomain {
  id: string;
  name: string;
  displayName: string | null;
  quickbooksId: string | null;
  billcomId: string | null;
  emailDomains: string[];
  knownEmails: string[];
  keywords: string[];
  defaultExpenseAccount: string | null;
  approvalThreshold: number;
  autoApproveVendors: string[];
  isActive: boolean;
}

// Client email mapping
export interface ClientEmailMapping {
  id: string;
  emailPattern: string;
  clientId: string;
  patternType: 'exact' | 'domain' | 'regex';
  confidence: number;
  source: 'manual' | 'learned' | 'imported';
  createdBy: string | null;
  createdAt: Date;
}

// Vendor info from external systems
export interface VendorInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  source: 'quickbooks' | 'billcom' | 'internal';
}

// Client statistics for dashboard
export interface ClientStats {
  clientId: string;
  totalEmails: number;
  processedEmails: number;
  pendingEmails: number;
  totalActions: number;
  approvedActions: number;
  rejectedActions: number;
  autoApprovedActions: number;
  lastActivityAt: Date | null;
}
