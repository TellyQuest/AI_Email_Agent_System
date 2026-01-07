import { Result } from '@ai-email-agent/utils';
import { ActionDomain, ActionResult } from '../types/action.js';
import { SagaDomain, SagaDefinition, SagaContext } from '../types/saga.js';

// Executor errors
export const ExecutorErrorCode = {
  ACTION_FAILED: 'ACTION_FAILED',
  COMPENSATION_FAILED: 'COMPENSATION_FAILED',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  TIMEOUT: 'TIMEOUT',
  NOT_APPROVED: 'NOT_APPROVED',
  INVALID_STATE: 'INVALID_STATE',
} as const;
export type ExecutorErrorCode = (typeof ExecutorErrorCode)[keyof typeof ExecutorErrorCode];

export interface ExecutorError {
  code: ExecutorErrorCode;
  message: string;
  details?: Record<string, unknown>;
  originalError?: Error;
}

// Action executor interface (for single actions)
export interface IActionExecutor {
  /**
   * Execute a single action
   */
  execute(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>>;

  /**
   * Execute compensation for a failed action
   */
  compensate(action: ActionDomain): Promise<Result<ActionResult, ExecutorError>>;

  /**
   * Check if an action can be executed
   */
  canExecute(action: ActionDomain): boolean;
}

// Saga executor interface (for multi-step transactions)
export interface ISagaExecutor {
  /**
   * Create and start a new saga
   */
  createSaga(definition: SagaDefinition): Promise<Result<SagaDomain, ExecutorError>>;

  /**
   * Execute a saga step by step
   */
  execute(saga: SagaDomain): Promise<Result<SagaDomain, ExecutorError>>;

  /**
   * Resume a paused saga (after approval)
   */
  resume(sagaId: string): Promise<Result<SagaDomain, ExecutorError>>;

  /**
   * Trigger manual compensation for a saga
   */
  compensate(sagaId: string): Promise<Result<SagaDomain, ExecutorError>>;

  /**
   * Get saga status
   */
  getStatus(sagaId: string): Promise<Result<SagaDomain | null, ExecutorError>>;
}

// Execution options
export interface ExecutionOptions {
  // Dry run - don't actually execute
  dryRun?: boolean;
  // Skip approval check
  skipApprovalCheck?: boolean;
  // Custom timeout
  timeoutMs?: number;
  // Retry configuration
  retryAttempts?: number;
}
