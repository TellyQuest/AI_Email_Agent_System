import {
  ok,
  err,
  Result,
  withRetry,
  retryPresets,
  CircuitBreaker,
  createCircuitBreaker,
  circuitBreakerPresets,
  createLogger,
} from '@ai-email-agent/utils';
import { getEnv } from '@ai-email-agent/config';

const logger = createLogger({ service: 'billcom-client' });

// Bill.com API errors
export interface BillComError {
  code: string;
  message: string;
  statusCode?: number;
}

// Bill.com entity types
export interface BCVendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  isActive: boolean;
}

export interface BCBill {
  id: string;
  vendorId: string;
  invoiceNumber?: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  amountDue: number;
  description?: string;
  lineItems: BCLineItem[];
  paymentStatus: 'Open' | 'Scheduled' | 'Paid' | 'Partial';
  approvalStatus: 'Unassigned' | 'Assigned' | 'Approving' | 'Approved' | 'Denied';
}

export interface BCLineItem {
  id?: string;
  amount: number;
  chartOfAccountId?: string;
  description?: string;
}

export interface BCPayment {
  id: string;
  vendorId: string;
  billId: string;
  amount: number;
  processDate: string;
  status: 'Scheduled' | 'Processing' | 'Completed' | 'Failed' | 'Voided';
  paymentType: 'Check' | 'ACH' | 'PayPal' | 'VendorCredit';
}

export class BillComClient {
  private baseUrl = 'https://api.bill.com/api/v2';
  private apiKey: string;
  private orgId: string;
  private sessionId: string | null = null;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    const env = getEnv();
    this.apiKey = env.BILLCOM_API_KEY;
    this.orgId = env.BILLCOM_ORG_ID;
    this.circuitBreaker = createCircuitBreaker('billcom', circuitBreakerPresets.billcom);
  }

  private async request<T>(
    operation: string,
    data: Record<string, unknown> = {}
  ): Promise<Result<T, BillComError>> {
    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          const formData = new URLSearchParams({
            devKey: this.apiKey,
            sessionId: this.sessionId ?? '',
            data: JSON.stringify(data),
          });

          const response = await fetch(`${this.baseUrl}/${operation}.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
          });

          const json = await response.json() as { response_status: number; response_message?: string; response_data: T };

          if (json.response_status === 1) {
            throw new Error(json.response_message || 'Bill.com API error');
          }

          return json.response_data;
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'API_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
      });
    }

    return ok(cbResult.value as T);
  }

  async login(userName: string, password: string): Promise<Result<void, BillComError>> {
    const result = await this.request<{ sessionId: string }>('Login', {
      userName,
      password,
      orgId: this.orgId,
    });

    if (!result.ok) return result;

    this.sessionId = result.value.sessionId;
    logger.info('Logged in to Bill.com');
    return ok(undefined);
  }

  async setSessionId(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
  }

  // Vendor operations
  async getVendor(vendorId: string): Promise<Result<BCVendor, BillComError>> {
    const result = await this.request<BCVendor>('Crud/Read/Vendor', { id: vendorId });
    if (!result.ok) return result;
    return ok(result.value);
  }

  async findVendorByName(name: string): Promise<Result<BCVendor | null, BillComError>> {
    const result = await this.request<BCVendor[]>('List/Vendor', {
      filters: [{ field: 'name', op: '=', value: name }],
    });
    if (!result.ok) return result;
    return ok(result.value[0] ?? null);
  }

  async createVendor(vendor: Omit<BCVendor, 'id'>): Promise<Result<BCVendor, BillComError>> {
    const result = await this.request<BCVendor>('Crud/Create/Vendor', { obj: vendor });
    if (!result.ok) return result;
    logger.info({ vendorId: result.value.id }, 'Created vendor');
    return ok(result.value);
  }

  // Bill operations
  async getBill(billId: string): Promise<Result<BCBill, BillComError>> {
    const result = await this.request<BCBill>('Crud/Read/Bill', { id: billId });
    if (!result.ok) return result;
    return ok(result.value);
  }

  async createBill(bill: Omit<BCBill, 'id' | 'paymentStatus' | 'approvalStatus'>): Promise<Result<BCBill, BillComError>> {
    const result = await this.request<BCBill>('Crud/Create/Bill', { obj: bill });
    if (!result.ok) return result;
    logger.info({ billId: result.value.id }, 'Created bill');
    return ok(result.value);
  }

  async updateBill(billId: string, updates: Partial<BCBill>): Promise<Result<BCBill, BillComError>> {
    const result = await this.request<BCBill>('Crud/Update/Bill', {
      obj: { id: billId, ...updates },
    });
    if (!result.ok) return result;
    logger.info({ billId }, 'Updated bill');
    return ok(result.value);
  }

  async deleteBill(billId: string): Promise<Result<void, BillComError>> {
    const result = await this.request<void>('Crud/Delete/Bill', { id: billId });
    if (!result.ok) return result;
    logger.info({ billId }, 'Deleted bill');
    return ok(undefined);
  }

  async findBillByInvoiceNumber(invoiceNumber: string): Promise<Result<BCBill | null, BillComError>> {
    const result = await this.request<BCBill[]>('List/Bill', {
      filters: [{ field: 'invoiceNumber', op: '=', value: invoiceNumber }],
    });
    if (!result.ok) return result;
    return ok(result.value[0] ?? null);
  }

  // Payment operations
  async schedulePayment(
    billId: string,
    vendorId: string,
    amount: number,
    processDate: string,
    paymentType: BCPayment['paymentType'] = 'ACH'
  ): Promise<Result<BCPayment, BillComError>> {
    const result = await this.request<BCPayment>('Crud/Create/SentPay', {
      obj: {
        billId,
        vendorId,
        amount,
        processDate,
        paymentType,
      },
    });
    if (!result.ok) return result;
    logger.info({ paymentId: result.value.id, billId }, 'Scheduled payment');
    return ok(result.value);
  }

  async getPayment(paymentId: string): Promise<Result<BCPayment, BillComError>> {
    const result = await this.request<BCPayment>('Crud/Read/SentPay', { id: paymentId });
    if (!result.ok) return result;
    return ok(result.value);
  }

  async voidPayment(paymentId: string): Promise<Result<void, BillComError>> {
    const result = await this.request<void>('VoidSentPay', { sentPayId: paymentId });
    if (!result.ok) return result;
    logger.info({ paymentId }, 'Voided payment');
    return ok(undefined);
  }

  // Approval operations
  async approveBill(billId: string): Promise<Result<BCBill, BillComError>> {
    const result = await this.request<BCBill>('ApprovePayable', { billId });
    if (!result.ok) return result;
    logger.info({ billId }, 'Approved bill');
    return ok(result.value);
  }

  async denyBill(billId: string, reason: string): Promise<Result<BCBill, BillComError>> {
    const result = await this.request<BCBill>('DenyPayable', { billId, denyReason: reason });
    if (!result.ok) return result;
    logger.info({ billId }, 'Denied bill');
    return ok(result.value);
  }
}

export const billcomClient = new BillComClient();
