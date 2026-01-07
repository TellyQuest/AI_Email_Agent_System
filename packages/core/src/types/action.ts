// Action domain types

export const ActionType = {
  CREATE_BILL: 'create_bill',
  UPDATE_BILL: 'update_bill',
  DELETE_BILL: 'delete_bill',
  CREATE_INVOICE: 'create_invoice',
  UPDATE_INVOICE: 'update_invoice',
  RECORD_PAYMENT: 'record_payment',
  SCHEDULE_PAYMENT: 'schedule_payment',
  EXECUTE_PAYMENT: 'execute_payment',
  SEND_INVOICE: 'send_invoice',
  RECONCILE: 'reconcile',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export const TargetSystem = {
  QUICKBOOKS: 'quickbooks',
  BILLCOM: 'billcom',
  INTERNAL: 'internal',
} as const;
export type TargetSystem = (typeof TargetSystem)[keyof typeof TargetSystem];

export const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const ActionStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATED: 'compensated',
} as const;
export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus];

export const Reversibility = {
  FULL: 'full',           // Can be fully undone
  COMPENSATE: 'compensate', // Requires compensating transaction
  SOFT_IRREVERSIBLE: 'soft_irreversible', // Needs manual intervention
  HARD_IRREVERSIBLE: 'hard_irreversible', // Cannot be undone
} as const;
export type Reversibility = (typeof Reversibility)[keyof typeof Reversibility];

// Compensation action (to undo a step)
export interface CompensationAction {
  actionType: ActionType;
  targetSystem: TargetSystem;
  parameters: Record<string, unknown>;
}

// Proposed action from the planner
export interface ProposedAction {
  id: string;
  actionType: ActionType;
  targetSystem: TargetSystem;
  parameters: Record<string, unknown>;
  reversibility: Reversibility;
  compensation?: CompensationAction;
  requiresApproval: boolean;
}

// Action plan containing multiple proposed actions
export interface ActionPlan {
  emailId: string;
  actions: ProposedAction[];
  reasoning: string;
}

// Execution result
export interface ActionResult {
  success: boolean;
  externalId?: string;
  data?: Record<string, unknown>;
  error?: string;
}

// Rule violation during validation
export interface RuleViolation {
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  violations: RuleViolation[];
  warnings: string[];
  appliedRules: string[];
}

// Risk assessment details
export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
  requiresApproval: boolean;
  appliedRules: string[];
  overrideAllowed: boolean;
}

// Action domain object
export interface ActionDomain {
  id: string;
  emailId: string;
  sagaId: string | null;
  actionType: ActionType;
  targetSystem: TargetSystem;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  riskReasons: string[];
  requiresApproval: boolean;
  status: ActionStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  executedAt: Date | null;
  result: ActionResult | null;
  externalId: string | null;
  error: string | null;
  isCompensated: boolean;
  compensatedAt: Date | null;
  compensationId: string | null;
}
