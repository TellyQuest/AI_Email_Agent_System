import { ActionType, TargetSystem, Reversibility, ActionResult } from './action.js';

// Saga status
export const SagaStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  AWAITING_APPROVAL: 'awaiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated',
} as const;
export type SagaStatus = (typeof SagaStatus)[keyof typeof SagaStatus];

// Step status
export const StepStatus = {
  PENDING: 'pending',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATED: 'compensated',
} as const;
export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];

// Saga step definition
export interface SagaStep {
  id: string;
  name: string;
  actionType: ActionType;
  targetSystem: TargetSystem;
  parameters: Record<string, unknown>;
  compensation?: {
    actionType: ActionType;
    parameters: Record<string, unknown>;
  };
  reversibility: Reversibility;
  requiresApproval: boolean;
  status: StepStatus;
  result?: ActionResult;
  executedAt?: Date;
  compensatedAt?: Date;
}

// Saga domain object
export interface SagaDomain {
  id: string;
  emailId: string;
  status: SagaStatus;
  currentStep: number;
  totalSteps: number;
  steps: SagaStep[];
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  compensatedAt: Date | null;
  error: string | null;
}

// Saga execution context
export interface SagaContext {
  sagaId: string;
  emailId: string;
  clientId: string | null;
  stepResults: Map<string, ActionResult>;
  metadata: Record<string, unknown>;
}

// Saga definition for creating new sagas
export interface SagaDefinition {
  emailId: string;
  steps: Array<{
    name: string;
    actionType: ActionType;
    targetSystem: TargetSystem;
    parameters: Record<string, unknown>;
    compensation?: {
      actionType: ActionType;
      parameters: Record<string, unknown>;
    };
    reversibility: Reversibility;
    requiresApproval: boolean;
  }>;
}
