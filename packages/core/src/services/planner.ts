import { Result } from '@ai-email-agent/utils';
import { EmailDomain, ExtractedData } from '../types/email.js';
import { ClientDomain } from '../types/client.js';
import { ActionPlan } from '../types/action.js';

// Planner errors
export const PlanErrorCode = {
  LLM_ERROR: 'LLM_ERROR',
  INVALID_DATA: 'INVALID_DATA',
  NO_ACTIONS: 'NO_ACTIONS',
  UNKNOWN_ACTION_TYPE: 'UNKNOWN_ACTION_TYPE',
} as const;
export type PlanErrorCode = (typeof PlanErrorCode)[keyof typeof PlanErrorCode];

export interface PlanError {
  code: PlanErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Planner service interface
export interface IPlannerService {
  /**
   * Generate an action plan based on extracted email data
   */
  plan(
    email: EmailDomain,
    extractedData: ExtractedData,
    client: ClientDomain | null
  ): Promise<Result<ActionPlan, PlanError>>;
}

// Planning options
export interface PlanOptions {
  // Override default model
  model?: string;
  // Limit action types to consider
  allowedActionTypes?: string[];
  // Include reasoning in plan
  includeReasoning?: boolean;
}

// Pre-defined action templates
export interface ActionTemplate {
  name: string;
  description: string;
  triggers: {
    emailTypes: string[];
    conditions?: Record<string, unknown>;
  };
  actions: Array<{
    actionType: string;
    targetSystem: string;
    parameterMapping: Record<string, string>; // Map extracted field to action param
  }>;
}
