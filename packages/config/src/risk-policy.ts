import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

// Risk levels
export const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

// Condition operators
const operatorSchema = z.enum(['>', '<', '>=', '<=', '==', '!=', 'in', 'not_in']);
export type Operator = z.infer<typeof operatorSchema>;

// Risk rule condition
const conditionSchema = z.object({
  field: z.string(),
  operator: operatorSchema,
  value: z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number())]),
});
export type RuleCondition = z.infer<typeof conditionSchema>;

// Risk rule
const riskRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  condition: conditionSchema,
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  requiresApproval: z.boolean(),
});
export type RiskRule = z.infer<typeof riskRuleSchema>;

// Risk behavior
const riskBehaviorSchema = z.object({
  requiresApproval: z.boolean(),
  approvalTimeoutHours: z.number().optional(),
  escalateAfterHours: z.number().optional(),
  notifyChannels: z.array(z.string()).optional(),
  includeInDailySummary: z.boolean().optional(),
  includeInWeeklySummary: z.boolean().optional(),
});
export type RiskBehavior = z.infer<typeof riskBehaviorSchema>;

// Client override
const clientOverrideSchema = z.object({
  clientId: z.string(),
  approvalThreshold: z.number().optional(),
  autoApproveVendors: z.array(z.string()).optional(),
  riskLevelOverride: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});
export type ClientOverride = z.infer<typeof clientOverrideSchema>;

// Settings
const settingsSchema = z.object({
  defaultRiskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  requireApprovalForNewVendors: z.boolean().default(true),
  requireApprovalForNewClients: z.boolean().default(true),
});
export type PolicySettings = z.infer<typeof settingsSchema>;

// Full policy
const riskPolicySchema = z.object({
  version: z.string(),
  settings: settingsSchema,
  rules: z.array(riskRuleSchema),
  riskBehaviors: z.record(z.enum(['low', 'medium', 'high', 'critical']), riskBehaviorSchema),
  clientOverrides: z.array(clientOverrideSchema).optional(),
});
export type RiskPolicy = z.infer<typeof riskPolicySchema>;

let cachedPolicy: RiskPolicy | undefined;

export function loadRiskPolicy(configPath?: string): RiskPolicy {
  if (cachedPolicy) {
    return cachedPolicy;
  }

  const policyPath = configPath ?? path.resolve(process.cwd(), 'config', 'risk-policy.yaml');

  if (!fs.existsSync(policyPath)) {
    console.warn(`Risk policy file not found at ${policyPath}, using default policy`);
    return getDefaultRiskPolicy();
  }

  const fileContent = fs.readFileSync(policyPath, 'utf-8');
  const parsed = YAML.parse(fileContent);

  const result = riskPolicySchema.safeParse(parsed);
  if (!result.success) {
    console.error('Invalid risk policy configuration:');
    console.error(result.error.format());
    throw new Error('Invalid risk policy configuration');
  }

  cachedPolicy = result.data;
  return cachedPolicy;
}

export function getDefaultRiskPolicy(): RiskPolicy {
  return {
    version: '1.0',
    settings: {
      defaultRiskLevel: 'medium',
      requireApprovalForNewVendors: true,
      requireApprovalForNewClients: true,
    },
    rules: [
      {
        name: 'critical_amount',
        description: 'Very high value transactions',
        condition: { field: 'amount', operator: '>', value: 25000 },
        riskLevel: 'critical',
        requiresApproval: true,
      },
      {
        name: 'high_amount',
        description: 'High value transactions',
        condition: { field: 'amount', operator: '>', value: 5000 },
        riskLevel: 'high',
        requiresApproval: true,
      },
      {
        name: 'new_vendor',
        description: 'First transaction with this vendor',
        condition: { field: 'vendor_transaction_count', operator: '==', value: 0 },
        riskLevel: 'high',
        requiresApproval: true,
      },
      {
        name: 'low_confidence',
        description: 'LLM extraction has low confidence',
        condition: { field: 'extraction_confidence', operator: '<', value: 0.8 },
        riskLevel: 'high',
        requiresApproval: true,
      },
      {
        name: 'payment_execution',
        description: 'Executing actual payment',
        condition: { field: 'action_type', operator: 'in', value: ['execute_payment', 'schedule_payment'] },
        riskLevel: 'critical',
        requiresApproval: true,
      },
    ],
    riskBehaviors: {
      critical: {
        requiresApproval: true,
        approvalTimeoutHours: 24,
        escalateAfterHours: 4,
        notifyChannels: ['email', 'slack'],
      },
      high: {
        requiresApproval: true,
        approvalTimeoutHours: 48,
        escalateAfterHours: 24,
        notifyChannels: ['email', 'slack'],
      },
      medium: {
        requiresApproval: false,
        includeInDailySummary: true,
        notifyChannels: ['email'],
      },
      low: {
        requiresApproval: false,
        includeInWeeklySummary: true,
      },
    },
  };
}

export function clearRiskPolicyCache(): void {
  cachedPolicy = undefined;
}
