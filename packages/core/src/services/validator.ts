import { Result } from '@ai-email-agent/utils';
import { ActionPlan, ValidationResult, RiskAssessment } from '../types/action.js';
import { ClientDomain } from '../types/client.js';
import { RiskPolicy } from '@ai-email-agent/config';

// Validation errors
export const ValidationErrorCode = {
  POLICY_ERROR: 'POLICY_ERROR',
  RULE_ERROR: 'RULE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;
export type ValidationErrorCode = (typeof ValidationErrorCode)[keyof typeof ValidationErrorCode];

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Validator service interface
export interface IValidatorService {
  /**
   * Validate an action plan against business rules and risk policies
   */
  validate(
    plan: ActionPlan,
    client: ClientDomain | null
  ): Promise<Result<ValidationResult, ValidationError>>;

  /**
   * Get risk assessment for a single action
   */
  assessRisk(
    actionType: string,
    parameters: Record<string, unknown>,
    context: RiskContext
  ): Promise<Result<RiskAssessment, ValidationError>>;

  /**
   * Reload risk policy configuration
   */
  reloadPolicy(): Promise<Result<void, ValidationError>>;
}

// Risk context for assessment
export interface RiskContext {
  clientId: string | null;
  vendorId?: string;
  vendorTransactionCount?: number;
  vendorAverageAmount?: number;
  clientActionCount?: number;
  extractionConfidence?: number;
  amountConfidence?: number;
  minutesSinceSimilarTransaction?: number;
}

// Validation options
export interface ValidationOptions {
  // Skip certain rule types
  skipRules?: string[];
  // Use custom policy instead of default
  customPolicy?: RiskPolicy;
  // Treat warnings as errors
  strictMode?: boolean;
}
