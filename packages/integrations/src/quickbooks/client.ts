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

const logger = createLogger({ service: 'quickbooks-client' });

// QuickBooks API errors
export interface QuickBooksError {
  code: string;
  message: string;
  statusCode?: number;
  fault?: unknown;
}

// QuickBooks entity types
export interface QBVendor {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Balance?: number;
}

export interface QBBill {
  Id: string;
  VendorRef: { value: string; name: string };
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance: number;
  DocNumber?: string;
  Line: QBLineItem[];
  PrivateNote?: string;
}

export interface QBLineItem {
  Id?: string;
  Amount: number;
  DetailType: 'AccountBasedExpenseLineDetail' | 'ItemBasedExpenseLineDetail';
  Description?: string;
  AccountBasedExpenseLineDetail?: {
    AccountRef: { value: string; name: string };
  };
}

export interface QBPayment {
  Id: string;
  TotalAmt: number;
  TxnDate: string;
  PaymentMethodRef?: { value: string; name: string };
  DepositToAccountRef?: { value: string; name: string };
  Line: Array<{
    Amount: number;
    LinkedTxn: Array<{
      TxnId: string;
      TxnType: string;
    }>;
  }>;
}

export class QuickBooksClient {
  private baseUrl: string;
  private realmId: string;
  private accessToken: string | null = null;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    const env = getEnv();
    this.realmId = ''; // Set during authentication
    this.baseUrl = 'https://quickbooks.api.intuit.com/v3/company';
    this.circuitBreaker = createCircuitBreaker('quickbooks', circuitBreakerPresets.quickbooks);
  }

  setCredentials(realmId: string, accessToken: string): void {
    this.realmId = realmId;
    this.accessToken = accessToken;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<Result<T, QuickBooksError>> {
    if (!this.accessToken || !this.realmId) {
      return err({
        code: 'NOT_AUTHENTICATED',
        message: 'QuickBooks credentials not set',
      });
    }

    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          const response = await fetch(`${this.baseUrl}/${this.realmId}${endpoint}`, {
            method,
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              JSON.stringify({
                statusCode: response.status,
                message: response.statusText,
                fault: errorData,
              })
            );
          }

          return await response.json();
        },
        retryPresets.externalApi
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      const errorMessage = cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error);
      try {
        const errorInfo = JSON.parse(errorMessage);
        return err({
          code: 'API_ERROR',
          message: errorInfo.message,
          statusCode: errorInfo.statusCode,
          fault: errorInfo.fault,
        });
      } catch {
        return err({
          code: 'API_ERROR',
          message: errorMessage,
        });
      }
    }

    return ok(cbResult.value as T);
  }

  // Vendor operations
  async getVendor(vendorId: string): Promise<Result<QBVendor, QuickBooksError>> {
    const result = await this.request<{ Vendor: QBVendor }>('GET', `/vendor/${vendorId}`);
    if (!result.ok) return result;
    return ok(result.value.Vendor);
  }

  async findVendorByName(name: string): Promise<Result<QBVendor | null, QuickBooksError>> {
    const query = `SELECT * FROM Vendor WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`;
    const result = await this.request<{ QueryResponse: { Vendor?: QBVendor[] } }>(
      'GET',
      `/query?query=${encodeURIComponent(query)}`
    );
    if (!result.ok) return result;
    return ok(result.value.QueryResponse.Vendor?.[0] ?? null);
  }

  async createVendor(vendor: Partial<QBVendor>): Promise<Result<QBVendor, QuickBooksError>> {
    const result = await this.request<{ Vendor: QBVendor }>('POST', '/vendor', vendor);
    if (!result.ok) return result;
    logger.info({ vendorId: result.value.Vendor.Id }, 'Created vendor');
    return ok(result.value.Vendor);
  }

  // Bill operations
  async getBill(billId: string): Promise<Result<QBBill, QuickBooksError>> {
    const result = await this.request<{ Bill: QBBill }>('GET', `/bill/${billId}`);
    if (!result.ok) return result;
    return ok(result.value.Bill);
  }

  async createBill(bill: Omit<QBBill, 'Id'>): Promise<Result<QBBill, QuickBooksError>> {
    const result = await this.request<{ Bill: QBBill }>('POST', '/bill', bill);
    if (!result.ok) return result;
    logger.info({ billId: result.value.Bill.Id }, 'Created bill');
    return ok(result.value.Bill);
  }

  async updateBill(bill: QBBill): Promise<Result<QBBill, QuickBooksError>> {
    const result = await this.request<{ Bill: QBBill }>('POST', '/bill', bill);
    if (!result.ok) return result;
    logger.info({ billId: result.value.Bill.Id }, 'Updated bill');
    return ok(result.value.Bill);
  }

  async deleteBill(billId: string, syncToken: string): Promise<Result<void, QuickBooksError>> {
    const result = await this.request<unknown>('POST', '/bill', {
      Id: billId,
      SyncToken: syncToken,
    });
    if (!result.ok) return result;
    logger.info({ billId }, 'Deleted bill');
    return ok(undefined);
  }

  async findBillByDocNumber(docNumber: string): Promise<Result<QBBill | null, QuickBooksError>> {
    const query = `SELECT * FROM Bill WHERE DocNumber = '${docNumber.replace(/'/g, "\\'")}'`;
    const result = await this.request<{ QueryResponse: { Bill?: QBBill[] } }>(
      'GET',
      `/query?query=${encodeURIComponent(query)}`
    );
    if (!result.ok) return result;
    return ok(result.value.QueryResponse.Bill?.[0] ?? null);
  }

  // Payment operations
  async createBillPayment(payment: Omit<QBPayment, 'Id'>): Promise<Result<QBPayment, QuickBooksError>> {
    const result = await this.request<{ BillPayment: QBPayment }>('POST', '/billpayment', payment);
    if (!result.ok) return result;
    logger.info({ paymentId: result.value.BillPayment.Id }, 'Created bill payment');
    return ok(result.value.BillPayment);
  }

  // Account operations
  async getAccounts(): Promise<Result<Array<{ Id: string; Name: string; AccountType: string }>, QuickBooksError>> {
    const query = 'SELECT * FROM Account WHERE AccountType IN (\'Expense\', \'Other Expense\', \'Cost of Goods Sold\')';
    const result = await this.request<{ QueryResponse: { Account?: Array<{ Id: string; Name: string; AccountType: string }> } }>(
      'GET',
      `/query?query=${encodeURIComponent(query)}`
    );
    if (!result.ok) return result;
    return ok(result.value.QueryResponse.Account ?? []);
  }
}

export const quickbooksClient = new QuickBooksClient();
