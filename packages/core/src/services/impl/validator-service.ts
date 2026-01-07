import { Result, ok, err, createLogger } from '@ai-email-agent/utils';
import {
  RiskPolicy,
  RiskRule,
  RiskLevel as PolicyRiskLevel,
  loadRiskPolicy,
  getDefaultRiskPolicy,
  clearRiskPolicyCache,
} from '@ai-email-agent/config';
import { ClientDomain } from '../../types/client.js';
import {
  ActionPlan,
  ProposedAction,
  ValidationResult,
  RiskAssessment,
  RuleViolation,
  RiskLevel,
} from '../../types/action.js';
import {
  IValidatorService,
  ValidationError,
  ValidationErrorCode,
  ValidationOptions,
  RiskContext,
} from '../validator.js';

const logger = createLogger({ service: 'validator-service' });

/**
 * Risk level priority for determining overall risk
 */
const RISK_PRIORITY: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Service implementation for validating action plans against risk policies
 */
export class ValidatorService implements IValidatorService {
  private policy: RiskPolicy;

  constructor(policy?: RiskPolicy, private options: ValidationOptions = {}) {
    this.policy = policy ?? options.customPolicy ?? getDefaultRiskPolicy();
  }

  /**
   * Validate an action plan against business rules and risk policies
   */
  async validate(
    plan: ActionPlan,
    client: ClientDomain | null
  ): Promise<Result<ValidationResult, ValidationError>> {
    logger.info(
      { emailId: plan.emailId, actionCount: plan.actions.length },
      'Validating action plan'
    );

    try {
      const violations: RuleViolation[] = [];
      const warnings: string[] = [];
      const appliedRules: string[] = [];
      let overallRiskLevel: RiskLevel = this.policy.settings.defaultRiskLevel as RiskLevel;
      let requiresApproval = false;

      for (const action of plan.actions) {
        const context = this.buildRiskContext(action, client);
        const assessment = await this.assessRisk(action.actionType, action.parameters, context);

        if (!assessment.ok) {
          return err(assessment.error);
        }

        const result = assessment.value;

        // Track applied rules
        appliedRules.push(...result.appliedRules);

        // Update overall risk level
        if (RISK_PRIORITY[result.level] > RISK_PRIORITY[overallRiskLevel]) {
          overallRiskLevel = result.level;
        }

        // Check for approval requirement
        if (result.requiresApproval) {
          requiresApproval = true;
        }

        // Add reasons as warnings
        for (const reason of result.reasons) {
          warnings.push(`${action.actionType}: ${reason}`);
        }
      }

      // Check client-specific overrides
      if (client && this.policy.clientOverrides) {
        const override = this.policy.clientOverrides.find((o) => o.clientId === client.id);
        if (override?.riskLevelOverride) {
          overallRiskLevel = override.riskLevelOverride as RiskLevel;
          appliedRules.push('client_risk_override');
        }
      }

      // Get behavior for this risk level
      const behavior = this.policy.riskBehaviors[overallRiskLevel as PolicyRiskLevel];
      if (behavior?.requiresApproval) {
        requiresApproval = true;
      }

      // Strict mode: treat warnings as errors
      if (this.options.strictMode && warnings.length > 0) {
        for (const warning of warnings) {
          violations.push({
            rule: 'strict_mode',
            message: warning,
            severity: 'error',
          });
        }
      }

      const result: ValidationResult = {
        valid: violations.filter((v) => v.severity === 'error').length === 0,
        riskLevel: overallRiskLevel,
        requiresApproval,
        violations,
        warnings,
        appliedRules: [...new Set(appliedRules)], // Deduplicate
      };

      logger.info(
        {
          emailId: plan.emailId,
          valid: result.valid,
          riskLevel: result.riskLevel,
          requiresApproval: result.requiresApproval,
          ruleCount: result.appliedRules.length,
        },
        'Validation complete'
      );

      return ok(result);
    } catch (error) {
      logger.error({ error }, 'Validation error');
      return err({
        code: ValidationErrorCode.POLICY_ERROR,
        message: error instanceof Error ? error.message : 'Unknown validation error',
        details: { planId: plan.emailId },
      });
    }
  }

  /**
   * Get risk assessment for a single action
   */
  async assessRisk(
    actionType: string,
    parameters: Record<string, unknown>,
    context: RiskContext
  ): Promise<Result<RiskAssessment, ValidationError>> {
    const reasons: string[] = [];
    const appliedRules: string[] = [];
    let riskLevel: RiskLevel = this.policy.settings.defaultRiskLevel as RiskLevel;
    let requiresApproval = false;

    // Skip specified rules
    const rulesToSkip = this.options.skipRules ?? [];

    for (const rule of this.policy.rules) {
      if (rulesToSkip.includes(rule.name)) {
        continue;
      }

      if (this.evaluateCondition(rule, actionType, parameters, context)) {
        appliedRules.push(rule.name);

        // Update risk level if this rule is higher
        if (RISK_PRIORITY[rule.riskLevel as RiskLevel] > RISK_PRIORITY[riskLevel]) {
          riskLevel = rule.riskLevel as RiskLevel;
        }

        if (rule.requiresApproval) {
          requiresApproval = true;
        }

        reasons.push(`${rule.name}: ${rule.description}`);
      }
    }

    // Check for new vendor
    if (
      this.policy.settings.requireApprovalForNewVendors &&
      context.vendorTransactionCount === 0
    ) {
      requiresApproval = true;
      reasons.push('First transaction with this vendor');
      appliedRules.push('new_vendor_policy');
    }

    // Check for new client
    if (
      this.policy.settings.requireApprovalForNewClients &&
      !context.clientId
    ) {
      requiresApproval = true;
      reasons.push('No client matched for this email');
      appliedRules.push('new_client_policy');
    }

    return ok({
      level: riskLevel,
      reasons,
      requiresApproval,
      appliedRules,
      overrideAllowed: riskLevel !== 'critical',
    });
  }

  /**
   * Reload risk policy configuration
   */
  async reloadPolicy(): Promise<Result<void, ValidationError>> {
    try {
      clearRiskPolicyCache();
      this.policy = loadRiskPolicy();
      logger.info('Risk policy reloaded');
      return ok(undefined);
    } catch (error) {
      return err({
        code: ValidationErrorCode.POLICY_ERROR,
        message: error instanceof Error ? error.message : 'Failed to reload policy',
      });
    }
  }

  /**
   * Build risk context from action and client
   */
  private buildRiskContext(action: ProposedAction, client: ClientDomain | null): RiskContext {
    const params = action.parameters;
    return {
      clientId: client?.id ?? null,
      vendorId: params['vendorId'] as string | undefined,
      vendorTransactionCount: 0, // Would need to query database
      vendorAverageAmount: undefined,
      clientActionCount: undefined,
      extractionConfidence: params['confidence'] as number | undefined,
      amountConfidence: undefined,
      minutesSinceSimilarTransaction: undefined,
    };
  }

  /**
   * Evaluate a rule condition against action data
   */
  private evaluateCondition(
    rule: RiskRule,
    actionType: string,
    parameters: Record<string, unknown>,
    context: RiskContext
  ): boolean {
    const { field, operator, value } = rule.condition;

    // Get the actual value based on field
    let actualValue: unknown;
    switch (field) {
      case 'amount':
        actualValue = this.parseAmount(parameters['amount']);
        break;
      case 'action_type':
        actualValue = actionType;
        break;
      case 'vendor_transaction_count':
        actualValue = context.vendorTransactionCount ?? 0;
        break;
      case 'extraction_confidence':
        actualValue = context.extractionConfidence ?? 1.0;
        break;
      case 'client_id':
        actualValue = context.clientId;
        break;
      default:
        actualValue = parameters[field];
    }

    // Evaluate based on operator
    switch (operator) {
      case '>':
        return Number(actualValue) > Number(value);
      case '<':
        return Number(actualValue) < Number(value);
      case '>=':
        return Number(actualValue) >= Number(value);
      case '<=':
        return Number(actualValue) <= Number(value);
      case '==':
        return actualValue === value;
      case '!=':
        return actualValue !== value;
      case 'in':
        return Array.isArray(value) && (value as Array<string | number>).includes(actualValue as string | number);
      case 'not_in':
        return Array.isArray(value) && !(value as Array<string | number>).includes(actualValue as string | number);
      default:
        return false;
    }
  }

  /**
   * Parse amount from various formats
   */
  private parseAmount(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Remove currency symbols and commas
      const cleaned = value.replace(/[$,]/g, '');
      return parseFloat(cleaned) || 0;
    }
    return 0;
  }
}

/**
 * Create a validator service instance
 */
export function createValidatorService(
  policy?: RiskPolicy,
  options?: ValidationOptions
): ValidatorService {
  return new ValidatorService(policy, options);
}
