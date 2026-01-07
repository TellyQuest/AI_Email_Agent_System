# AI Email Agent for Bookkeeping Firm
## Production System Specification v2.0

---

## Executive Summary

This document specifies a production-grade AI-powered email agent that automates bookkeeping workflows for a professional accounting firm. The system ingests emails, classifies them, extracts financial data, and safely executes actions in QuickBooks and Bill.com while maintaining strict safety controls and full auditability.

**Target Scale:** 1,000 emails/day (~300 financial actions/day)

**Core Philosophy:** Correctness over convenience. Every financial operation must be validated, traceable, and reversible where possible.

---

## Table of Contents

1. [Business Goals](#1-business-goals)
2. [Scale & Performance Requirements](#2-scale--performance-requirements)
3. [Technology Decisions](#3-technology-decisions)
4. [System Architecture](#4-system-architecture)
5. [Core Components](#5-core-components)
6. [Data Models](#6-data-models)
7. [LLM Integration](#7-llm-integration)
8. [Client Matching System](#8-client-matching-system)
9. [Risk Classification Engine](#9-risk-classification-engine)
10. [Saga Execution & Rollback](#10-saga-execution--rollback)
11. [Security & Compliance](#11-security--compliance)
12. [Failure Handling](#12-failure-handling)
13. [Observability](#13-observability)
14. [API Specification](#14-api-specification)
15. [Project Structure](#15-project-structure)
16. [Deployment](#16-deployment)
17. [Development Workflow](#17-development-workflow)

---

## 1. Business Goals

### Primary Objectives

| # | Goal | Success Metric |
|---|------|----------------|
| 1 | Ingest emails from Outlook in near real-time | < 30 second delay from receipt |
| 2 | Accurately classify and categorize emails | > 95% classification accuracy |
| 3 | Match emails to correct clients | > 90% auto-match rate after 30 days |
| 4 | Extract actionable financial information | > 90% extraction accuracy for key fields |
| 5 | Safely update QuickBooks and Bill.com | Zero unauthorized financial actions |
| 6 | Prevent incorrect financial actions | 100% high-risk actions require approval |
| 7 | Maintain full auditability | Complete trace for every action |
| 8 | Reduce manual workload | 70% reduction in routine bookkeeping tasks |

### Non-Goals (Explicitly Out of Scope)

- Tax preparation or filing
- Payroll processing
- Financial forecasting or advisory
- Multi-tenant SaaS (single firm only)
- Mobile application
- Real-time chat with clients

---

## 2. Scale & Performance Requirements

### Volume Specifications

| Metric | Value | Notes |
|--------|-------|-------|
| Daily email volume | 1,000 | Peak: 1,500 |
| Emails requiring financial action | ~300/day (30%) | Based on industry analysis |
| High-risk actions requiring approval | ~30-50/day | 10-15% of financial actions |
| Peak hourly load | 100 emails/hour | Business hours concentration |
| Concurrent email processing | 50 simultaneous | Worker pool capacity |

### Performance Targets

| Operation | Target Latency | P99 Latency |
|-----------|---------------|-------------|
| Email ingestion | < 5s | < 10s |
| Classification (LLM) | < 3s | < 5s |
| Data extraction (LLM) | < 5s | < 8s |
| Client matching | < 500ms | < 1s |
| Risk validation | < 200ms | < 500ms |
| QuickBooks API call | < 2s | < 5s |
| Bill.com API call | < 2s | < 5s |
| End-to-end (auto-execute) | < 15s | < 30s |

### Reliability Targets

| Metric | Target |
|--------|--------|
| System uptime | 99.5% |
| Data durability | 99.999% |
| Zero data loss | Mandatory |
| Recovery Time Objective (RTO) | < 1 hour |
| Recovery Point Objective (RPO) | < 5 minutes |

---

## 3. Technology Decisions

### Language: TypeScript

**Decision:** TypeScript 5.x with Node.js 20+ (or Bun) is the primary backend language.

**Rationale:**

| Factor | TypeScript Advantage |
|--------|----------------------|
| **Type Safety** | Compile-time type checking catches bugs before runtime. Strict mode enforces null checks, exhaustive switches, etc. |
| **Async/Await** | Native, elegant handling of I/O-bound operations. Perfect for API orchestration with multiple external services. |
| **Full-Stack** | Same language for backend API and React dashboard. Shared types, reduced context switching. |
| **Ecosystem** | Excellent libraries for every integration: Anthropic SDK, Microsoft Graph, database ORMs. |
| **Developer Velocity** | Faster iteration than compiled languages while maintaining type safety. |
| **LLM Integration** | First-class Anthropic SDK support, extensive examples and documentation. |

**Key TypeScript Practices for Financial Systems:**

```typescript
// Strict configuration (tsconfig.json)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}

// Result types instead of throwing (financial operations)
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Branded types for financial amounts
type USD = number & { readonly brand: unique symbol };
function usd(amount: number): USD { return amount as USD; }

// Zod for runtime validation of external data
const InvoiceSchema = z.object({
  amount: z.number().positive(),
  vendor: z.string().min(1),
  dueDate: z.coerce.date(),
});
```

### Technology Stack

```
CORE APPLICATION
├── Language:           TypeScript 5.x (strict mode)
├── Runtime:            Node.js 20 LTS (or Bun for faster startup)
├── Web Framework:      Fastify (high performance, schema validation)
├── Validation:         Zod (runtime schema validation)
├── Configuration:      @t3-oss/env-core (type-safe env vars)
└── CLI:                Commander.js (for admin commands)

DATA LAYER
├── Primary Database:   PostgreSQL 16
├── ORM:                Drizzle ORM (type-safe, SQL-like)
├── Migrations:         Drizzle Kit
├── Cache:              Redis 7 (via ioredis)
├── Object Storage:     MinIO (S3-compatible, via @aws-sdk/client-s3)
└── Search (optional):  PostgreSQL full-text (upgrade to Meilisearch if needed)

MESSAGING & JOBS
├── Job Queue:          BullMQ (Redis-backed, reliable)
├── Pub/Sub:            Redis Pub/Sub or PostgreSQL LISTEN/NOTIFY
└── Future Scale:       AWS SQS or NATS (if exceeding 10k/day)

EXTERNAL INTEGRATIONS
├── LLM:                @anthropic-ai/sdk (official TypeScript SDK)
├── Email:              @microsoft/microsoft-graph-client
├── Accounting:         intuit-oauth + custom QuickBooks client
└── Payments:           Bill.com REST API (custom client)

OBSERVABILITY
├── Metrics:            prom-client + Grafana
├── Logging:            Pino (structured JSON, fast)
├── Tracing:            OpenTelemetry (@opentelemetry/sdk-node)
└── Alerting:           Alertmanager → PagerDuty/Slack

DASHBOARD
├── Frontend:           React 18 + TypeScript + Vite
├── UI Components:      shadcn/ui + Tailwind CSS
├── State Management:   TanStack Query
├── Real-time:          Socket.io or native WebSocket
├── Auth:               JWT + RBAC
└── API Client:         Shared types with backend (monorepo)

DEPLOYMENT
├── Containerization:   Docker
├── Orchestration:      Docker Compose (single node) or K8s (multi-node)
├── CI/CD:              GitHub Actions
├── Secrets:            HashiCorp Vault or AWS Secrets Manager
└── SSL:                Let's Encrypt / Caddy
```

---

## 4. System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                             │
│                           AI Email Agent v2.0                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EXTERNAL SYSTEMS                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │ Outlook  │  │ Claude   │  │QuickBooks│  │ Bill.com │                    │
│  │ (Graph)  │  │  API     │  │   API    │  │   API    │                    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                    │
│       │             │             │             │                           │
│ ══════╪═════════════╪═════════════╪═════════════╪══════════════════════════ │
│       │             │             │             │                           │
│  ┌────┴─────────────┴─────────────┴─────────────┴────┐                     │
│  │              INTEGRATION LAYER                     │                     │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │                     │
│  │  │   Outlook   │ │  Anthropic  │ │   External  │  │                     │
│  │  │   Client    │ │   Client    │ │ API Clients │  │                     │
│  │  └─────────────┘ └─────────────┘ └─────────────┘  │                     │
│  │         │                │               │        │                     │
│  │         └────────┬───────┴───────┬───────┘        │                     │
│  │                  │               │                │                     │
│  │           ┌──────┴──────┐ ┌──────┴──────┐        │                     │
│  │           │Circuit      │ │  Rate       │        │                     │
│  │           │Breaker      │ │  Limiter    │        │                     │
│  │           └─────────────┘ └─────────────┘        │                     │
│  └───────────────────────────┬───────────────────────┘                     │
│                              │                                              │
│ ═════════════════════════════╪═════════════════════════════════════════════ │
│                              │                                              │
│  ┌───────────────────────────┴───────────────────────────────────────────┐ │
│  │                        PROCESSING LAYER                                │ │
│  │                                                                        │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │                     INGESTION SERVICE                            │  │ │
│  │  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │  │ │
│  │  │   │   Webhook    │    │   Poller     │    │   Deduper    │     │  │ │
│  │  │   │   Handler    │    │  (Fallback)  │    │              │     │  │ │
│  │  │   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │  │ │
│  │  │          └────────────┬──────┴───────────────────┘             │  │ │
│  │  └───────────────────────┼────────────────────────────────────────┘  │ │
│  │                          ▼                                            │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │                      JOB QUEUE (River)                          │  │ │
│  │  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │  │ │
│  │  │   │classify │ │extract  │ │validate │ │execute  │ │ audit   │  │  │ │
│  │  │   │_email   │ │_data    │ │_action  │ │_action  │ │ _log    │  │  │ │
│  │  │   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │  │ │
│  │  └───────────────────────────┬─────────────────────────────────────┘  │ │
│  │                              │                                        │ │
│  │  ┌───────────────────────────┴───────────────────────────────────┐   │ │
│  │  │                    WORKER POOL (N=10)                          │   │ │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      ┌────────┐  │   │ │
│  │  │  │Worker 1│ │Worker 2│ │Worker 3│ │Worker 4│ ···  │Worker N│  │   │ │
│  │  │  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘      └───┬────┘  │   │ │
│  │  │      └──────────┴──────────┴──────────┴───────────────┘       │   │ │
│  │  └───────────────────────────┬────────────────────────────────────┘   │ │
│  │                              │                                        │ │
│  │  ┌───────────────────────────┴───────────────────────────────────┐   │ │
│  │  │                   PROCESSING PIPELINE                          │   │ │
│  │  │                                                                │   │ │
│  │  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   │   │ │
│  │  │  │  Parse   │──▶│ Classify │──▶│  Match   │──▶│ Extract  │   │   │ │
│  │  │  │  Email   │   │  (LLM)   │   │  Client  │   │  Data    │   │   │ │
│  │  │  └──────────┘   └──────────┘   └──────────┘   └──────────┘   │   │ │
│  │  │                                                     │         │   │ │
│  │  │  ┌──────────┐   ┌──────────┐   ┌──────────┐        │         │   │ │
│  │  │  │  Route   │◀──│ Validate │◀──│   Plan   │◀───────┘         │   │ │
│  │  │  │          │   │  & Risk  │   │ Actions  │                   │   │ │
│  │  │  └────┬─────┘   └──────────┘   └──────────┘                   │   │ │
│  │  │       │                                                        │   │ │
│  │  │       ├─────────────────┬──────────────────┐                  │   │ │
│  │  │       ▼                 ▼                  ▼                  │   │ │
│  │  │  ┌─────────┐      ┌──────────┐      ┌───────────┐            │   │ │
│  │  │  │  Auto   │      │  Review  │      │  Archive  │            │   │ │
│  │  │  │ Execute │      │  Queue   │      │  (No Act) │            │   │ │
│  │  │  │(Low Rsk)│      │(High Rsk)│      │           │            │   │ │
│  │  │  └────┬────┘      └────┬─────┘      └───────────┘            │   │ │
│  │  │       │                │                                      │   │ │
│  │  └───────┼────────────────┼──────────────────────────────────────┘   │ │
│  │          │                │                                          │ │
│  └──────────┼────────────────┼──────────────────────────────────────────┘ │
│             │                │                                            │
│ ════════════╪════════════════╪════════════════════════════════════════════ │
│             │                ▼                                            │
│  ┌──────────┼───────────────────────────────────────────────────────────┐ │
│  │          │          HUMAN INTERFACE LAYER                             │ │
│  │          │                                                            │ │
│  │          │     ┌─────────────────────────────────────────────┐       │ │
│  │          │     │            REVIEW DASHBOARD                  │       │ │
│  │          │     │  ┌─────────────────────────────────────┐    │       │ │
│  │          │     │  │  Pending Reviews: 12                │    │       │ │
│  │          │     │  │  ┌─────────────────────────────────┐│    │       │ │
│  │          │     │  │  │ Invoice #4521 - $7,500         ││    │       │ │
│  │          │     │  │  │ Vendor: New Supplier Inc        ││    │       │ │
│  │          │     │  │  │ Risk: HIGH (new vendor + amt)   ││    │       │ │
│  │          │     │  │  │ [Approve] [Reject] [Edit]       ││    │       │ │
│  │          │     │  │  └─────────────────────────────────┘│    │       │ │
│  │          │     │  └─────────────────────────────────────┘    │       │ │
│  │          │     └──────────────────────┬──────────────────────┘       │ │
│  │          │                            │ (on approve)                 │ │
│  │          │◀───────────────────────────┘                              │ │
│  │          │                                                            │ │
│  └──────────┼────────────────────────────────────────────────────────────┘ │
│             │                                                              │
│ ════════════╪══════════════════════════════════════════════════════════════ │
│             ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                       EXECUTION LAYER                                │  │
│  │                                                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐ │  │
│  │  │                    SAGA EXECUTOR                                │ │  │
│  │  │                                                                 │ │  │
│  │  │   Transaction: Create Bill + Record Payment                    │ │  │
│  │  │   ┌─────────────────────────────────────────────────────────┐  │ │  │
│  │  │   │ Step 1: Create Bill (QB)     ───────────────────────▶  │  │ │  │
│  │  │   │         Compensation: Delete Bill                       │  │ │  │
│  │  │   ├─────────────────────────────────────────────────────────┤  │ │  │
│  │  │   │ Step 2: Create Bill (Bill.com) ─────────────────────▶  │  │ │  │
│  │  │   │         Compensation: Delete Bill                       │  │ │  │
│  │  │   ├─────────────────────────────────────────────────────────┤  │ │  │
│  │  │   │ Step 3: Schedule Payment       ─────────────────────▶  │  │ │  │
│  │  │   │         Compensation: NONE (irreversible)              │  │ │  │
│  │  │   │         REQUIRES: Human Approval                        │  │ │  │
│  │  │   └─────────────────────────────────────────────────────────┘  │ │  │
│  │  │                                                                 │ │  │
│  │  │   On Failure at Step N:                                        │ │  │
│  │  │   → Execute compensations for Steps N-1, N-2, ..., 1           │ │  │
│  │  │   → Mark saga as "rolled_back"                                 │ │  │
│  │  │   → Alert human operator                                       │ │  │
│  │  │                                                                 │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  │                              │                                       │  │
│  └──────────────────────────────┼───────────────────────────────────────┘  │
│                                 │                                          │
│ ════════════════════════════════╪══════════════════════════════════════════ │
│                                 ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         DATA LAYER                                   │  │
│  │                                                                      │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │  │
│  │  │   PostgreSQL    │  │     Redis       │  │       MinIO         │  │  │
│  │  │   (Primary)     │  │    (Cache)      │  │   (Object Store)    │  │  │
│  │  │                 │  │                 │  │                     │  │  │
│  │  │  • Emails       │  │  • Sessions     │  │  • Email archives   │  │  │
│  │  │  • Clients      │  │  • Rate limits  │  │  • Attachments      │  │  │
│  │  │  • Tasks        │  │  • API cache    │  │  • Audit exports    │  │  │
│  │  │  • Actions      │  │  • Dist. locks  │  │                     │  │  │
│  │  │  • Audit logs   │  │                 │  │                     │  │  │
│  │  │  • Job queue    │  │                 │  │                     │  │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Sequence

```
1. EMAIL ARRIVES
   Outlook → Webhook/Poll → Ingestion Service → Dedupe Check → Job Queue

2. CLASSIFICATION
   Worker picks job → Parse email → LLM Classification → Store result

3. CLIENT MATCHING
   Extract sender info → Check explicit mappings → Domain match →
   LLM content analysis → Match or flag for review

4. DATA EXTRACTION
   LLM extracts structured data → Validate schema → Confidence scoring

5. ACTION PLANNING
   Generate proposed actions → Validate against policies → Risk scoring

6. ROUTING
   Low risk → Auto-execute queue
   High risk → Review dashboard
   No action → Archive

7. HUMAN REVIEW (if required)
   Display context → Human decision → Approve/Reject/Edit

8. EXECUTION
   Saga executor → Step-by-step execution → Compensate on failure

9. AUDIT
   Log all decisions → Store immutable record → Update metrics
```

---

## 5. Core Components

### 5.1 Ingestion Service

**Responsibility:** Receive emails from Outlook and queue them for processing.

```typescript
interface IngestionService {
  // Handle incoming Outlook webhook notifications
  handleWebhook(notification: WebhookNotification): Promise<Result<void, IngestionError>>;

  // Fetch new emails (fallback when webhooks fail)
  poll(): Promise<Result<Email[], IngestionError>>;

  // Check if email was already processed
  isDuplicate(messageId: string): Promise<boolean>;
}
```

**Behavior:**
- Primary: Microsoft Graph webhook subscription
- Fallback: Poll every 60 seconds if webhook fails
- Deduplication by Message-ID header
- Store raw email immediately, then queue for processing

### 5.2 Classifier Service

**Responsibility:** Categorize emails using LLM.

```typescript
interface ClassifierService {
  // Determine the email type and intent
  classify(email: Email): Promise<Result<Classification, ClassificationError>>;
}

interface Classification {
  type: EmailType;        // 'invoice' | 'receipt' | 'payment_notice' | 'inquiry' | 'irrelevant'
  intent: string;         // what the sender wants
  urgency: UrgencyLevel;  // 'low' | 'medium' | 'high' | 'critical'
  confidence: number;     // 0.0 - 1.0
}

type EmailType = 'invoice' | 'receipt' | 'payment_notice' | 'bank_notice' | 'inquiry' | 'irrelevant';
type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
```

### 5.3 Client Matcher Service

**Responsibility:** Match emails to client accounts.

```typescript
interface ClientMatcherService {
  // Attempt to identify which client this email belongs to
  match(email: Email): Promise<Result<ClientMatch, MatchError>>;

  // Store a human-confirmed mapping for future use
  learnMapping(mapping: ClientMapping): Promise<Result<void, MatchError>>;
}

interface ClientMatch {
  clientId: string | null;       // null if unmatched
  matchMethod: MatchMethod;      // 'explicit' | 'domain' | 'content' | 'thread' | 'unmatched'
  confidence: number;
  candidates: Client[];          // if multiple possible matches
}

type MatchMethod = 'explicit' | 'domain' | 'vendor' | 'content' | 'thread' | 'unmatched';
```

### 5.4 Extractor Service

**Responsibility:** Extract structured financial data from emails.

```typescript
interface ExtractorService {
  // Pull structured data from email content
  extract(email: Email, classification: Classification): Promise<Result<ExtractedData, ExtractionError>>;
}

interface ExtractedData {
  vendorName: ConfidentValue<string>;
  amount: ConfidentValue<Decimal>;
  currency: ConfidentValue<string>;
  dueDate: ConfidentValue<Date>;
  invoiceNumber: ConfidentValue<string>;
  lineItems: LineItem[];
  attachments: AttachmentInfo[];
}

interface ConfidentValue<T> {
  value: T | null;
  confidence: number;         // 0.0 - 1.0
  source: ExtractionSource;   // where in the email this was found
}

type ExtractionSource = 'subject' | 'body' | 'attachment' | 'inferred';
```

### 5.5 Planner Service

**Responsibility:** Generate proposed actions based on extracted data.

```typescript
interface PlannerService {
  // Generate proposed actions for the extracted data
  plan(email: Email, extracted: ExtractedData, client: Client): Promise<Result<ActionPlan, PlanError>>;
}

interface ActionPlan {
  emailId: string;
  actions: ProposedAction[];
  reasoning: string;
}

interface ProposedAction {
  id: string;
  type: ActionType;
  targetSystem: TargetSystem;
  parameters: Record<string, unknown>;
  reversible: boolean;
  compensation?: CompensationAction;
}

type ActionType = 'create_bill' | 'update_bill' | 'create_invoice' | 'record_payment' | 'schedule_payment' | 'reconcile';
type TargetSystem = 'quickbooks' | 'billcom' | 'internal';
```

### 5.6 Validator Service

**Responsibility:** Apply business rules and risk scoring.

```typescript
interface ValidatorService {
  // Check actions against business rules
  validate(plan: ActionPlan, client: Client): Promise<Result<ValidationResult, ValidationError>>;
}

interface ValidationResult {
  valid: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  violations: RuleViolation[];
  warnings: string[];
  appliedRules: string[];
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface RuleViolation {
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}
```

### 5.7 Saga Executor

**Responsibility:** Execute multi-step actions with rollback capability.

```typescript
interface SagaExecutor {
  // Run a saga with automatic compensation on failure
  execute(saga: Saga): Promise<Result<SagaResult, SagaError>>;

  // Manually trigger rollback for a saga
  compensate(sagaId: string): Promise<Result<void, SagaError>>;
}

interface Saga {
  id: string;
  emailId: string;
  steps: SagaStep[];
  state: SagaState;
  metadata: Record<string, unknown>;
}

interface SagaStep {
  id: string;
  name: string;
  action: Action;
  compensation?: Action;
  reversibility: Reversibility;
  requiresApproval: boolean;
  state: StepState;
  result?: StepResult;
  executedAt?: Date;
}

type SagaState = 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'compensating' | 'compensated';
type StepState = 'pending' | 'executing' | 'completed' | 'failed' | 'compensated';
type Reversibility = 'full' | 'compensate' | 'soft_irreversible' | 'hard_irreversible';
```

### 5.8 Review Dashboard API

**Responsibility:** Serve the human review interface.

```typescript
interface ReviewDashboardAPI {
  // Get items awaiting human decision
  getPendingReviews(filters: ReviewFilters): Promise<Result<ReviewItem[], APIError>>;

  // Approve a pending action
  approveAction(actionId: string, approverId: string): Promise<Result<void, APIError>>;

  // Reject a pending action with reason
  rejectAction(actionId: string, approverId: string, reason: string): Promise<Result<void, APIError>>;

  // Modify and approve an action
  editAndApprove(actionId: string, edits: ActionEdits, approverId: string): Promise<Result<void, APIError>>;
}

interface ReviewFilters {
  riskLevel?: RiskLevel;
  clientId?: string;
  actionType?: ActionType;
  limit?: number;
  offset?: number;
}

interface ReviewItem {
  action: Action;
  email: Email;
  client: Client | null;
  extractedData: ExtractedData;
  riskAssessment: RiskAssessment;
  createdAt: Date;
}
```

---

## 6. Data Models

### 6.1 Core Entities

```sql
-- Emails table
CREATE TABLE emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      VARCHAR(255) UNIQUE NOT NULL,  -- Outlook Message-ID
    conversation_id VARCHAR(255),
    subject         TEXT NOT NULL,
    sender_email    VARCHAR(255) NOT NULL,
    sender_name     VARCHAR(255),
    recipient_email VARCHAR(255) NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL,
    body_text       TEXT,
    body_html       TEXT,
    raw_headers     JSONB,
    has_attachments BOOLEAN DEFAULT FALSE,

    -- Processing state
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    classification  JSONB,
    client_id       UUID REFERENCES clients(id),
    match_method    VARCHAR(50),
    match_confidence DECIMAL(3,2),
    extracted_data  JSONB,

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'classified', 'matched', 'extracted', 'planned', 'completed', 'failed', 'archived'))
);

CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_client_id ON emails(client_id);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX idx_emails_sender_email ON emails(sender_email);

-- Clients table
CREATE TABLE clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    display_name    VARCHAR(255),
    quickbooks_id   VARCHAR(100),
    billcom_id      VARCHAR(100),

    -- Matching helpers
    email_domains   TEXT[],          -- ['acme.com', 'acmecorp.com']
    known_emails    TEXT[],          -- specific email addresses
    keywords        TEXT[],          -- for content matching

    -- Settings
    default_expense_account VARCHAR(100),
    approval_threshold      DECIMAL(12,2) DEFAULT 5000.00,
    auto_approve_vendors    TEXT[],  -- vendor IDs that don't need review

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_clients_quickbooks_id ON clients(quickbooks_id);
CREATE INDEX idx_clients_billcom_id ON clients(billcom_id);

-- Client email mappings (learned from corrections)
CREATE TABLE client_email_mappings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_pattern   VARCHAR(255) NOT NULL,  -- exact email or domain pattern
    client_id       UUID NOT NULL REFERENCES clients(id),
    pattern_type    VARCHAR(20) NOT NULL,   -- 'exact', 'domain', 'regex'
    confidence      DECIMAL(3,2) DEFAULT 1.0,
    source          VARCHAR(50) NOT NULL,   -- 'manual', 'learned', 'imported'
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(email_pattern, pattern_type)
);

-- Actions table
CREATE TABLE actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id        UUID NOT NULL REFERENCES emails(id),
    saga_id         UUID REFERENCES sagas(id),

    -- Action definition
    action_type     VARCHAR(50) NOT NULL,
    target_system   VARCHAR(50) NOT NULL,
    parameters      JSONB NOT NULL,

    -- Risk assessment
    risk_level      VARCHAR(20) NOT NULL,
    risk_reasons    TEXT[],
    requires_approval BOOLEAN DEFAULT FALSE,

    -- Execution state
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    approved_by     UUID,
    approved_at     TIMESTAMPTZ,
    rejected_by     UUID,
    rejected_at     TIMESTAMPTZ,
    rejection_reason TEXT,
    executed_at     TIMESTAMPTZ,

    -- Results
    result          JSONB,
    external_id     VARCHAR(255),  -- ID in external system (QB, Bill.com)
    error           TEXT,

    -- Compensation
    is_compensated  BOOLEAN DEFAULT FALSE,
    compensated_at  TIMESTAMPTZ,
    compensation_id UUID,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_action_status CHECK (status IN ('pending', 'approved', 'rejected', 'executing', 'completed', 'failed', 'compensated'))
);

CREATE INDEX idx_actions_email_id ON actions(email_id);
CREATE INDEX idx_actions_status ON actions(status);
CREATE INDEX idx_actions_requires_approval ON actions(requires_approval) WHERE requires_approval = TRUE;

-- Sagas table (for multi-step transactions)
CREATE TABLE sagas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id        UUID NOT NULL REFERENCES emails(id),

    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    current_step    INT DEFAULT 0,
    total_steps     INT NOT NULL,

    steps           JSONB NOT NULL,  -- Array of step definitions

    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    compensated_at  TIMESTAMPTZ,

    error           TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_saga_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'compensating', 'compensated'))
);

-- Immutable audit log
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- What happened
    event_type      VARCHAR(100) NOT NULL,
    event_category  VARCHAR(50) NOT NULL,

    -- Context
    email_id        UUID,
    action_id       UUID,
    saga_id         UUID,
    client_id       UUID,
    user_id         UUID,

    -- Details
    description     TEXT NOT NULL,
    old_value       JSONB,
    new_value       JSONB,
    metadata        JSONB,

    -- Security
    ip_address      INET,
    user_agent      TEXT,

    -- Integrity
    checksum        VARCHAR(64) NOT NULL  -- SHA-256 of row contents
);

-- Partitioned by month for performance
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_email_id ON audit_log(email_id);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);

-- Prevent updates/deletes on audit log
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
```

### 6.2 Enumerations

```typescript
// Email status (processing lifecycle)
const EmailStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  CLASSIFIED: 'classified',
  MATCHED: 'matched',
  EXTRACTED: 'extracted',
  PLANNED: 'planned',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
} as const;
type EmailStatus = typeof EmailStatus[keyof typeof EmailStatus];

// Email classification types
const EmailType = {
  INVOICE: 'invoice',
  RECEIPT: 'receipt',
  PAYMENT_NOTICE: 'payment_notice',
  BANK_NOTICE: 'bank_notice',
  INQUIRY: 'inquiry',
  IRRELEVANT: 'irrelevant',
} as const;
type EmailType = typeof EmailType[keyof typeof EmailType];

// Action types for financial operations
const ActionType = {
  CREATE_BILL: 'create_bill',
  UPDATE_BILL: 'update_bill',
  CREATE_INVOICE: 'create_invoice',
  RECORD_PAYMENT: 'record_payment',
  SCHEDULE_PAYMENT: 'schedule_payment',
  RECONCILE: 'reconcile',
} as const;
type ActionType = typeof ActionType[keyof typeof ActionType];

// Target systems for actions
const TargetSystem = {
  QUICKBOOKS: 'quickbooks',
  BILLCOM: 'billcom',
  INTERNAL: 'internal',
} as const;
type TargetSystem = typeof TargetSystem[keyof typeof TargetSystem];

// Risk levels for validation
const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
type RiskLevel = typeof RiskLevel[keyof typeof RiskLevel];
```

---

## 7. LLM Integration

### 7.1 Model Selection

| Task | Model | Reasoning |
|------|-------|-----------|
| Classification | claude-sonnet-4-20250514 | Fast, accurate for categorization |
| Data Extraction | claude-sonnet-4-20250514 | Structured output, good accuracy |
| Complex Analysis | claude-sonnet-4-20250514 | When extraction confidence is low |

### 7.2 Structured Output Schema

All LLM responses must conform to strict Zod schemas with confidence scores.

```typescript
import { z } from 'zod';

// Classification prompt output schema
const ClassificationOutputSchema = z.object({
  emailType: z.enum(['invoice', 'receipt', 'payment_notice', 'bank_notice', 'inquiry', 'irrelevant']),
  intent: z.string().max(500),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

// Confident value schema (generic)
const confidentValue = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1),
    source: z.enum(['subject', 'body', 'attachment', 'inferred']),
  });

// Extraction prompt output schema
const ExtractionOutputSchema = z.object({
  vendorName: confidentValue(z.string()),
  amount: confidentValue(z.string()), // String to preserve decimal precision
  currency: confidentValue(z.string()),
  dueDate: confidentValue(z.string()), // ISO date string
  invoiceNumber: confidentValue(z.string()),
  description: confidentValue(z.string()),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: z.string(),
    quantity: z.number().optional(),
  })),
  overallConfidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;
```

### 7.3 Prompt Templates

```typescript
const buildClassificationPrompt = (email: Email): string => `
You are an expert bookkeeper assistant. Analyze the following email and classify it.

EMAIL:
From: ${email.senderEmail} (${email.senderName})
Subject: ${email.subject}
Date: ${email.receivedAt.toISOString()}

Body:
${email.bodyText}

Classify this email into exactly one category:
- invoice: A bill or invoice requesting payment
- receipt: A payment confirmation or receipt
- payment_notice: Notification about payment status
- bank_notice: Bank statement or notification
- inquiry: Question or request requiring response
- irrelevant: Spam, marketing, or unrelated to bookkeeping

Respond with valid JSON matching this exact schema:
{
  "email_type": "string (one of the categories above)",
  "intent": "string (brief description of what the sender wants)",
  "urgency": "string (low/medium/high/critical)",
  "confidence": number (0.0 to 1.0),
  "reasoning": "string (brief explanation of your classification)"
}

Important:
- Be conservative with confidence scores
- If the email is ambiguous, use confidence < 0.7
- Invoice detection should look for: amounts, due dates, payment instructions
- Receipt detection should look for: "thank you for your payment", confirmation numbers
`;

const buildExtractionPrompt = (email: Email, classification: Classification): string => `
You are an expert bookkeeper assistant. Extract financial data from this email.

EMAIL TYPE: ${classification.type}
From: ${email.senderEmail} (${email.senderName})
Subject: ${email.subject}

Body:
${email.bodyText}

${email.attachments.length > 0 ? `
Attachments:
${email.attachments.map(a => `- ${a.filename} (${a.contentType})`).join('\n')}
` : ''}

Extract all relevant financial information. For each field, provide:
- value: the extracted value (use null if not found)
- confidence: 0.0 to 1.0 (how certain you are)
- source: where you found this ("subject", "body", "attachment_name", "inferred")

Respond with valid JSON matching this schema:
{
  "vendor_name": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "amount": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "currency": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "due_date": {"value": "YYYY-MM-DD|null", "confidence": 0.0-1.0, "source": "string"},
  "invoice_number": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "description": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "line_items": [{"description": "string", "amount": "string", "quantity": number}],
  "overall_confidence": 0.0-1.0,
  "warnings": ["string"]
}

Rules:
- Amounts should include only numbers and decimal point (e.g., "1250.00" not "$1,250.00")
- Dates in YYYY-MM-DD format
- Set confidence < 0.7 if you're guessing or inferring
- Add warnings for any ambiguities or potential issues
`;
```

### 7.4 LLM Error Handling

```typescript
import Anthropic from '@anthropic-ai/sdk';

class LLMService {
  private client: Anthropic;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(apiKey: string, maxRetries = 3, timeoutMs = 30000) {
    this.client = new Anthropic({ apiKey });
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
  }

  async classifyEmail(email: Email): Promise<Result<ClassificationOutput, LLMError>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.callWithTimeout(
          buildClassificationPrompt(email)
        );

        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          lastError = new Error('No JSON found in response');
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate with Zod schema
        const result = ClassificationOutputSchema.safeParse(parsed);
        if (!result.success) {
          lastError = new Error(`Schema validation failed: ${result.error.message}`);
          continue;
        }

        return { ok: true, value: result.data };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on abort
        if (err instanceof Error && err.name === 'AbortError') {
          return { ok: false, error: { type: 'timeout', message: 'Request timed out' } };
        }

        // Exponential backoff with jitter
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await sleep(delay);
      }
    }

    return {
      ok: false,
      error: {
        type: 'max_retries_exceeded',
        message: `LLM classification failed after ${this.maxRetries} attempts: ${lastError?.message}`,
      },
    };
  }

  private async callWithTimeout(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock?.text ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
```

### 7.5 Confidence Thresholds

| Threshold | Action |
|-----------|--------|
| confidence >= 0.9 | Auto-proceed |
| 0.7 <= confidence < 0.9 | Proceed with warning flag |
| 0.5 <= confidence < 0.7 | Route to human review |
| confidence < 0.5 | Reject, request manual processing |

### 7.6 Token Budget Management

```typescript
interface TokenBudget {
  maxTokensPerEmail: number;    // 4000
  maxDailyTokens: number;       // 1000000
  costAlertThreshold: number;   // $50/day
}

interface TokenUsage {
  emailId: string;
  operation: 'classify' | 'extract' | 'plan';
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: Date;
}

class TokenBudgetManager {
  constructor(
    private budget: TokenBudget,
    private repository: TokenUsageRepository,
    private alertService: AlertService
  ) {}

  async trackUsage(usage: TokenUsage): Promise<void> {
    await this.repository.save(usage);

    const dailyTotal = await this.repository.getDailyTotal();
    if (dailyTotal.cost >= this.budget.costAlertThreshold) {
      await this.alertService.send({
        type: 'token_budget_warning',
        message: `Daily LLM cost ($${dailyTotal.cost}) exceeds threshold ($${this.budget.costAlertThreshold})`,
      });
    }
  }

  async canProcess(estimatedTokens: number): Promise<boolean> {
    const dailyTotal = await this.repository.getDailyTotal();
    return dailyTotal.tokens + estimatedTokens <= this.budget.maxDailyTokens;
  }
}
```

---

## 8. Client Matching System

### 8.1 Matching Hierarchy

The system uses a tiered approach to match emails to clients:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT MATCHING HIERARCHY                     │
│                    (Evaluated in order)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1: EXPLICIT MAPPING (Confidence: 1.0)                     │
│  ├─ Exact email address match                                   │
│  ├─ Human-confirmed mappings stored in database                 │
│  └─ Example: "john@acme.com" → Client "Acme Corporation"        │
│                                                                  │
│  TIER 2: DOMAIN MAPPING (Confidence: 0.95)                      │
│  ├─ Extract sender domain                                        │
│  ├─ Match against client's registered domains                   │
│  └─ Example: "*@acme.com" → Client "Acme Corporation"           │
│                                                                  │
│  TIER 3: KNOWN VENDOR MAPPING (Confidence: 0.9)                 │
│  ├─ Recognize common vendors (utilities, services)              │
│  ├─ Map to client based on account numbers in email             │
│  └─ Example: "PG&E bill for account #12345" → Client w/ acct    │
│                                                                  │
│  TIER 4: LLM CONTENT ANALYSIS (Confidence: varies)              │
│  ├─ Extract company names from email body                       │
│  ├─ Fuzzy match against known client names                      │
│  └─ Example: "Invoice for Acme Corp" → Client "Acme Corporation"│
│                                                                  │
│  TIER 5: CONVERSATION THREAD (Confidence: 0.85)                 │
│  ├─ Check if email is reply to known thread                     │
│  ├─ Inherit client from original email                          │
│  └─ Example: Reply to invoice thread → Same client              │
│                                                                  │
│  TIER 6: UNMATCHED → HUMAN QUEUE (Confidence: 0)                │
│  ├─ New sender with no content match                            │
│  ├─ Human assigns client → Creates explicit mapping             │
│  └─ System learns from corrections                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Matching Algorithm

```typescript
class ClientMatcherService {
  constructor(
    private repository: ClientRepository,
    private llmService: LLMService,
    private logger: Logger
  ) {}

  async match(email: Email): Promise<Result<ClientMatch, MatchError>> {
    // Tier 1: Explicit email mapping
    const exactMatch = await this.repository.getClientByExactEmail(email.senderEmail);
    if (exactMatch) {
      return {
        ok: true,
        value: {
          clientId: exactMatch.id,
          matchMethod: 'explicit',
          confidence: 1.0,
          candidates: [],
        },
      };
    }

    // Tier 2: Domain mapping
    const domain = this.extractDomain(email.senderEmail);
    const domainMatch = await this.repository.getClientByDomain(domain);
    if (domainMatch) {
      return {
        ok: true,
        value: {
          clientId: domainMatch.id,
          matchMethod: 'domain',
          confidence: 0.95,
          candidates: [],
        },
      };
    }

    // Tier 3: Known vendor mapping
    const vendorMatch = await this.matchKnownVendor(email);
    if (vendorMatch) {
      return { ok: true, value: vendorMatch };
    }

    // Tier 4: LLM content analysis
    const llmMatch = await this.llmContentMatch(email);
    if (llmMatch.ok && llmMatch.value.confidence >= 0.7) {
      return llmMatch;
    }

    // Tier 5: Conversation thread
    if (email.conversationId) {
      const threadMatch = await this.repository.getClientByConversation(email.conversationId);
      if (threadMatch) {
        return {
          ok: true,
          value: {
            clientId: threadMatch.id,
            matchMethod: 'thread',
            confidence: 0.85,
            candidates: [],
          },
        };
      }
    }

    // Tier 6: Unmatched - get candidate suggestions
    const candidates = await this.suggestCandidates(email);
    return {
      ok: true,
      value: {
        clientId: null,
        matchMethod: 'unmatched',
        confidence: 0,
        candidates,
      },
    };
  }

  private extractDomain(email: string): string {
    return email.split('@')[1]?.toLowerCase() ?? '';
  }

  private async suggestCandidates(email: Email): Promise<Client[]> {
    // Use fuzzy matching on sender name and email content
    const searchTerms = [
      email.senderName,
      this.extractDomain(email.senderEmail),
    ].filter(Boolean);

    return this.repository.searchClients(searchTerms, { limit: 5 });
  }
}
```

### 8.3 Learning from Corrections

When a human corrects a client match, the system learns:

```typescript
class ClientMatcherService {
  // ... other methods

  async learnFromCorrection(
    emailId: string,
    correctClientId: string,
    userId: string
  ): Promise<Result<void, MatchError>> {
    const email = await this.repository.getEmail(emailId);
    if (!email) {
      return { ok: false, error: { type: 'not_found', message: 'Email not found' } };
    }

    // Create explicit mapping for future
    await this.repository.createMapping({
      emailPattern: email.senderEmail,
      clientId: correctClientId,
      patternType: 'exact',
      confidence: 1.0,
      source: 'learned',
      createdBy: userId,
    });

    // Also create domain mapping if this is a new domain
    const domain = this.extractDomain(email.senderEmail);
    const existingDomain = await this.repository.getMappingByDomain(domain);

    if (!existingDomain) {
      await this.repository.createMapping({
        emailPattern: domain,
        clientId: correctClientId,
        patternType: 'domain',
        confidence: 0.8, // Lower confidence, can be overridden
        source: 'learned',
        createdBy: userId,
      });
    }

    // Log the learning event
    await this.auditService.log({
      type: 'client_mapping_learned',
      emailId,
      clientId: correctClientId,
      userId,
      description: `Learned mapping: ${email.senderEmail} → client ${correctClientId}`,
    });

    return { ok: true, value: undefined };
  }
}
```

### 8.4 Bootstrap Strategy

For cold-start (no existing data):

| Week | Expected Auto-Match Rate | Human Review Load |
|------|--------------------------|-------------------|
| 1 | 10-20% | High (~800/day) |
| 2 | 40-50% | Medium (~500/day) |
| 3 | 60-70% | Moderate (~300/day) |
| 4 | 75-80% | Lower (~200/day) |
| Month 2+ | 85-95% | Minimal (~50-100/day) |

**Accelerated Bootstrap:**
1. Import client list with known domains
2. Pre-populate common vendor mappings (utilities, major suppliers)
3. Use first week to train system intensively

---

## 9. Risk Classification Engine

### 9.1 Risk Policy Configuration

Risk rules are defined in YAML for easy modification without code changes:

```yaml
# config/risk_policy.yaml

version: "1.0"

# Global settings
settings:
  default_risk_level: medium
  require_approval_for_new_vendors: true
  require_approval_for_new_clients: true

# Risk rules evaluated in order - first match wins for each category
rules:
  # === AMOUNT-BASED RULES ===
  - name: critical_amount
    description: "Very high value transactions"
    condition:
      field: amount
      operator: ">"
      value: 25000
    risk_level: critical
    requires_approval: true

  - name: high_amount
    description: "High value transactions"
    condition:
      field: amount
      operator: ">"
      value: 5000
    risk_level: high
    requires_approval: true

  - name: medium_amount
    description: "Medium value transactions"
    condition:
      field: amount
      operator: ">"
      value: 1000
    risk_level: medium
    requires_approval: false
    flag_for_review: true  # Include in daily summary

  # === VENDOR-BASED RULES ===
  - name: new_vendor
    description: "First transaction with this vendor"
    condition:
      field: vendor_transaction_count
      operator: "=="
      value: 0
    risk_level: high
    requires_approval: true

  - name: vendor_amount_anomaly
    description: "Amount significantly higher than usual for this vendor"
    condition:
      field: amount
      operator: ">"
      value: "vendor.avg_amount * 3"
    risk_level: high
    requires_approval: true

  # === CLIENT-BASED RULES ===
  - name: unmatched_client
    description: "Could not determine which client this belongs to"
    condition:
      field: client_match_confidence
      operator: "<"
      value: 0.7
    risk_level: high
    requires_approval: true

  - name: new_client_first_action
    description: "First automated action for this client"
    condition:
      field: client_action_count
      operator: "=="
      value: 0
    risk_level: high
    requires_approval: true

  # === CONFIDENCE-BASED RULES ===
  - name: low_extraction_confidence
    description: "LLM was not confident in data extraction"
    condition:
      field: extraction_confidence
      operator: "<"
      value: 0.8
    risk_level: high
    requires_approval: true

  - name: low_amount_confidence
    description: "Amount extraction specifically has low confidence"
    condition:
      field: amount_confidence
      operator: "<"
      value: 0.9
    risk_level: high
    requires_approval: true

  # === ACTION-TYPE RULES ===
  - name: payment_execution
    description: "Actually sending money - always requires approval"
    condition:
      field: action_type
      operator: "in"
      value: ["execute_payment", "schedule_payment"]
    risk_level: critical
    requires_approval: true

  - name: invoice_to_customer
    description: "Sending invoice to customer"
    condition:
      field: action_type
      operator: "=="
      value: "send_invoice"
    risk_level: high
    requires_approval: true

  - name: bill_creation
    description: "Creating a bill (reversible)"
    condition:
      field: action_type
      operator: "=="
      value: "create_bill"
    risk_level: low
    requires_approval: false

  # === TIME-BASED RULES ===
  - name: duplicate_timeframe
    description: "Similar transaction within short timeframe"
    condition:
      field: similar_transaction_minutes
      operator: "<"
      value: 60
    risk_level: high
    requires_approval: true

# Risk level behaviors
risk_behaviors:
  critical:
    requires_approval: true
    approval_timeout_hours: 24
    escalate_after_hours: 4
    notify_channels: ["email", "slack", "sms"]

  high:
    requires_approval: true
    approval_timeout_hours: 48
    escalate_after_hours: 24
    notify_channels: ["email", "slack"]

  medium:
    requires_approval: false
    include_in_daily_summary: true
    notify_channels: ["email"]

  low:
    requires_approval: false
    include_in_weekly_summary: true
    notify_channels: []

# Override rules for specific clients
client_overrides:
  - client_id: "trusted-client-123"
    approval_threshold: 10000  # Higher threshold for trusted clients
    auto_approve_vendors: ["vendor-abc", "vendor-xyz"]
```

### 9.2 Risk Evaluation Engine

```typescript
interface RiskPolicy {
  rules: RiskRule[];
  clientOverrides: Map<string, ClientOverride>;
}

interface RiskRule {
  name: string;
  description: string;
  condition: RuleCondition;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

const RISK_LEVEL_PRIORITY: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

class RiskEngine {
  constructor(
    private policy: RiskPolicy,
    private repository: Repository
  ) {}

  async evaluate(
    action: ProposedAction,
    context: ActionContext
  ): Promise<Result<RiskAssessment, RiskError>> {
    const assessment: RiskAssessment = {
      riskLevel: 'low',
      requiresApproval: false,
      reasons: [],
      appliedRules: [],
      warnings: [],
    };

    // Evaluate each rule
    for (const rule of this.policy.rules) {
      const matches = await this.evaluateRule(rule, action, context);

      if (matches) {
        assessment.appliedRules.push(rule.name);
        assessment.reasons.push(rule.description);

        // Escalate risk level if this rule is higher
        if (RISK_LEVEL_PRIORITY[rule.riskLevel] > RISK_LEVEL_PRIORITY[assessment.riskLevel]) {
          assessment.riskLevel = rule.riskLevel;
        }

        // Any rule requiring approval triggers it
        if (rule.requiresApproval) {
          assessment.requiresApproval = true;
        }
      }
    }

    // Apply client-specific overrides
    const override = this.policy.clientOverrides.get(context.clientId);
    if (override) {
      this.applyOverride(assessment, override, action);
    }

    return { ok: true, value: assessment };
  }

  private async evaluateRule(
    rule: RiskRule,
    action: ProposedAction,
    context: ActionContext
  ): Promise<boolean> {
    const { field, operator, value } = rule.condition;
    const actualValue = this.getFieldValue(field, action, context);

    switch (operator) {
      case '>':
        return Number(actualValue) > Number(value);
      case '<':
        return Number(actualValue) < Number(value);
      case '==':
        return actualValue === value;
      case 'in':
        return Array.isArray(value) && value.includes(actualValue);
      default:
        return false;
    }
  }

  private getFieldValue(
    field: string,
    action: ProposedAction,
    context: ActionContext
  ): unknown {
    const fieldMap: Record<string, unknown> = {
      amount: action.parameters.amount,
      action_type: action.type,
      vendor_transaction_count: context.vendorTransactionCount,
      client_match_confidence: context.clientMatchConfidence,
      extraction_confidence: context.extractionConfidence,
      amount_confidence: context.amountConfidence,
    };
    return fieldMap[field];
  }
}

interface RiskAssessment {
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  reasons: string[];
  appliedRules: string[];
  warnings: string[];
}
```

### 9.3 Risk Metrics

Track and monitor risk patterns:

```typescript
interface RiskMetrics {
  // Daily aggregates
  totalActionsEvaluated: number;
  actionsByRiskLevel: Record<RiskLevel, number>;
  approvalRate: number;
  averageApprovalTimeMs: number;

  // Anomaly detection
  unusualPatterns: AnomalyPattern[];
  falsePositiveRate: number;
  falseNegativeRate: number;
}

interface AnomalyPattern {
  type: string;
  description: string;
  occurrences: number;
  lastSeen: Date;
}
```

---

## 10. Saga Execution & Rollback

### 10.1 Action Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACTION REVERSIBILITY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FULLY REVERSIBLE                                                │
│  Actions that can be completely undone                           │
│  ├─ Create draft bill        → Delete draft                     │
│  ├─ Create draft invoice     → Delete draft                     │
│  ├─ Update bill (unpaid)     → Restore previous values          │
│  └─ Add attachment           → Remove attachment                │
│                                                                  │
│  COMPENSATABLE                                                   │
│  Actions requiring counter-transaction                           │
│  ├─ Post journal entry       → Post reversing entry             │
│  ├─ Record payment received  → Record refund/adjustment         │
│  ├─ Apply credit             → Remove credit                    │
│  └─ Record expense           → Record expense reversal          │
│                                                                  │
│  SOFT IRREVERSIBLE                                               │
│  Actions with limited undo window                                │
│  ├─ Send invoice (email)     → Can void, but customer saw it    │
│  ├─ Submit bill for approval → Can recall if not yet approved   │
│  └─ Create vendor            → Can deactivate, not delete       │
│                                                                  │
│  HARD IRREVERSIBLE                                               │
│  Actions that cannot be undone - ALWAYS REQUIRE APPROVAL         │
│  ├─ Execute payment (ACH)    → Money sent, cannot retrieve      │
│  ├─ Execute payment (check)  → Check issued                     │
│  ├─ Submit tax filing        → Filed with authority             │
│  └─ Delete with cascade      → Data permanently lost            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Saga Definition

```typescript
interface Saga {
  id: string;
  emailId: string;
  description: string;
  steps: SagaStep[];
  state: SagaState;

  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  currentStep: number;
  error?: string;
  metadata: Record<string, unknown>;
}

interface SagaStep {
  id: string;
  name: string;
  action: Action;
  compensation?: Action;

  reversibility: Reversibility;
  requiresApproval: boolean;
  approvedBy?: string;
  approvedAt?: Date;

  state: StepState;
  result?: StepResult;
  executedAt?: Date;
  compensatedAt?: Date;
}

type SagaState = 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'compensating' | 'compensated' | 'compensation_failed';
type StepState = 'pending' | 'executing' | 'completed' | 'failed' | 'compensated';
type Reversibility = 'full' | 'compensate' | 'soft_irreversible' | 'hard_irreversible';
```

### 10.3 Saga Executor Implementation

```typescript
class SagaExecutor {
  constructor(
    private repository: SagaRepository,
    private qbClient: QuickBooksClient,
    private billClient: BillComClient,
    private auditService: AuditService
  ) {}

  async execute(saga: Saga): Promise<Result<SagaResult, SagaError>> {
    // Update state to running
    saga.state = 'running';
    saga.startedAt = new Date();
    await this.repository.updateSaga(saga);

    // Execute steps in order
    for (let i = 0; i < saga.steps.length; i++) {
      const step = saga.steps[i];
      saga.currentStep = i;

      // Check if step requires approval
      if (step.requiresApproval && !step.approvedBy) {
        saga.state = 'awaiting_approval';
        await this.repository.updateSaga(saga);
        return {
          ok: true,
          value: {
            status: 'awaiting_approval',
            currentStep: i,
            message: `Step '${step.name}' requires approval`,
          },
        };
      }

      // Execute the step
      step.state = 'executing';
      await this.repository.updateStep(saga.id, step);

      const result = await this.executeStep(step);

      if (!result.ok) {
        // Step failed - initiate compensation
        step.state = 'failed';
        step.result = { error: result.error.message };
        await this.repository.updateStep(saga.id, step);

        // Compensate all previously completed steps
        const compResult = await this.compensate(saga, i - 1);

        if (!compResult.ok) {
          saga.state = 'compensation_failed';
          saga.error = `Execution failed: ${result.error.message}, compensation failed: ${compResult.error.message}`;
        } else {
          saga.state = 'compensated';
          saga.error = result.error.message;
        }

        await this.repository.updateSaga(saga);
        return {
          ok: false,
          error: { type: 'execution_failed', message: saga.error ?? '' },
        };
      }

      // Step succeeded
      step.state = 'completed';
      step.result = result.value;
      step.executedAt = new Date();
      await this.repository.updateStep(saga.id, step);

      // Audit log
      await this.auditService.log({
        type: 'saga_step_completed',
        sagaId: saga.id,
        description: `Completed step: ${step.name}`,
        newValue: result.value,
      });
    }

    // All steps completed
    saga.state = 'completed';
    saga.completedAt = new Date();
    await this.repository.updateSaga(saga);

    return {
      ok: true,
      value: {
        status: 'completed',
        message: 'All steps executed successfully',
      },
    };
  }

  private async compensate(saga: Saga, fromStep: number): Promise<Result<void, SagaError>> {
    saga.state = 'compensating';
    await this.repository.updateSaga(saga);

    // Compensate in reverse order
    for (let i = fromStep; i >= 0; i--) {
      const step = saga.steps[i];

      if (step.state !== 'completed') {
        continue; // Skip steps that weren't completed
      }

      if (!step.compensation) {
        await this.auditService.log({
          type: 'saga_step_no_compensation',
          sagaId: saga.id,
          description: `Step '${step.name}' has no compensation action`,
        });
        continue;
      }

      // Execute compensation
      const result = await this.executeAction(step.compensation);

      if (!result.ok) {
        // Compensation failed - this is serious
        await this.auditService.log({
          type: 'saga_compensation_failed',
          sagaId: saga.id,
          description: `Compensation failed for step '${step.name}': ${result.error.message}`,
        });
        return {
          ok: false,
          error: { type: 'compensation_failed', message: `Compensation failed for step ${step.name}` },
        };
      }

      step.compensatedAt = new Date();
      await this.repository.updateStep(saga.id, step);

      await this.auditService.log({
        type: 'saga_step_compensated',
        sagaId: saga.id,
        description: `Compensated step: ${step.name}`,
      });
    }

    return { ok: true, value: undefined };
  }

  private async executeStep(step: SagaStep): Promise<Result<StepResult, StepError>> {
    switch (step.action.targetSystem) {
      case 'quickbooks':
        return this.qbClient.execute(step.action);
      case 'billcom':
        return this.billClient.execute(step.action);
      default:
        return { ok: false, error: { type: 'unknown_system', message: 'Unknown target system' } };
    }
  }

  private async executeAction(action: Action): Promise<Result<unknown, ActionError>> {
    return this.executeStep({ action } as SagaStep);
  }
}
```

### 10.4 Example Saga: Invoice Processing

```typescript
import { v4 as uuid } from 'uuid';

// Create a saga for processing an invoice
function createInvoiceProcessingSaga(
  email: Email,
  extracted: ExtractedData,
  client: Client
): Saga {
  return {
    id: uuid(),
    emailId: email.id,
    description: `Process invoice from ${extracted.vendorName.value} for $${extracted.amount.value}`,
    state: 'pending',
    currentStep: 0,
    steps: [
      {
        id: uuid(),
        name: 'Create bill in QuickBooks',
        action: {
          type: 'create_bill',
          targetSystem: 'quickbooks',
          parameters: {
            vendorName: extracted.vendorName.value,
            amount: extracted.amount.value,
            dueDate: extracted.dueDate.value,
            invoiceNumber: extracted.invoiceNumber.value,
            clientId: client.quickbooksId,
          },
        },
        compensation: {
          type: 'delete_bill',
          targetSystem: 'quickbooks',
          parameters: { billId: '{{step_result.billId}}' },
        },
        reversibility: 'full',
        requiresApproval: false,
        state: 'pending',
      },
      {
        id: uuid(),
        name: 'Create bill in Bill.com',
        action: {
          type: 'create_bill',
          targetSystem: 'billcom',
          parameters: {
            vendorName: extracted.vendorName.value,
            amount: extracted.amount.value,
            dueDate: extracted.dueDate.value,
          },
        },
        compensation: {
          type: 'delete_bill',
          targetSystem: 'billcom',
          parameters: { billId: '{{step_result.billId}}' },
        },
        reversibility: 'full',
        requiresApproval: false,
        state: 'pending',
      },
      {
        id: uuid(),
        name: 'Schedule payment',
        action: {
          type: 'schedule_payment',
          targetSystem: 'billcom',
          parameters: {
            billId: '{{steps[1].result.billId}}',
            paymentDate: extracted.dueDate.value,
            amount: extracted.amount.value,
          },
        },
        compensation: undefined, // IRREVERSIBLE
        reversibility: 'hard_irreversible',
        requiresApproval: true, // Always requires approval
        state: 'pending',
      },
    ],
    metadata: {},
  };
}
```

---

## 11. Security & Compliance

### 11.1 Authentication & Authorization

```yaml
# Authentication flows
authentication:
  outlook:
    type: oauth2
    provider: microsoft
    scopes:
      - Mail.Read
      - Mail.ReadWrite
      - User.Read
    token_storage: encrypted_database
    refresh_strategy: proactive  # Refresh before expiry

  quickbooks:
    type: oauth2
    provider: intuit
    scopes:
      - com.intuit.quickbooks.accounting
    token_storage: encrypted_database

  billcom:
    type: api_key
    key_storage: vault  # HashiCorp Vault
    rotation_days: 90

  dashboard:
    type: jwt
    issuer: "ai-email-agent"
    algorithm: RS256
    access_token_ttl: 15m
    refresh_token_ttl: 7d

# Role-based access control
rbac:
  roles:
    admin:
      permissions:
        - "*"

    bookkeeper:
      permissions:
        - "emails:read"
        - "emails:process"
        - "actions:approve"
        - "actions:reject"
        - "clients:read"
        - "reports:read"

    viewer:
      permissions:
        - "emails:read"
        - "actions:read"
        - "clients:read"
        - "reports:read"
```

### 11.2 Data Protection

```typescript
// Sensitive fields are encrypted at rest
interface EncryptedFields {
  // Database column-level encryption
  emailBody: string;        // AES-256-GCM encrypted
  attachmentData: Buffer;   // AES-256-GCM encrypted
  apiTokens: string;        // AES-256-GCM encrypted

  // Audit log protection
  auditChecksum: string;    // SHA-256 integrity
}

// PII handling policy
interface PIIPolicy {
  // Fields containing PII
  piiFields: string[];

  // Retention
  retentionDays: number;    // 7 years for financial records (2555)
  anonymizeAfterDays: number; // Anonymize PII after 1 year (365)

  // Access logging
  logPIIAccess: boolean;
  requireJustification: boolean;
}

const defaultPIIPolicy: PIIPolicy = {
  piiFields: [
    'sender_email',
    'sender_name',
    'email_body',
    'extracted_data.vendor_name',
  ],
  retentionDays: 2555,        // 7 years
  anonymizeAfterDays: 365,    // 1 year
  logPIIAccess: true,
  requireJustification: true,
};
```

### 11.3 Audit Requirements

```typescript
// Every auditable event must be logged
interface AuditEvent {
  // Identity
  id: string;
  timestamp: Date;

  // What happened
  eventType: string;
  category: AuditCategory;
  description: string;

  // Context
  emailId?: string;
  actionId?: string;
  sagaId?: string;
  clientId?: string;
  userId?: string;

  // Changes
  oldValue?: unknown;
  newValue?: unknown;

  // Security context
  ipAddress: string;
  userAgent: string;
  sessionId: string;

  // Integrity
  checksum: string;  // SHA-256(all_fields)
}

// Audit event categories
const AuditCategory = {
  AUTH: 'authentication',
  EMAIL: 'email_processing',
  ACTION: 'financial_action',
  APPROVAL: 'approval_workflow',
  SYSTEM: 'system_event',
  CONFIG: 'configuration_change',
} as const;
type AuditCategory = typeof AuditCategory[keyof typeof AuditCategory];
```

### 11.4 Compliance Checklist

| Requirement | Implementation |
|-------------|----------------|
| SOC 2 Type II | Audit logging, access controls, encryption |
| GDPR | PII handling, retention policies, right to deletion |
| PCI DSS (if handling cards) | Not storing card data, tokenization |
| Financial record retention | 7-year retention, immutable audit logs |
| Data residency | Configurable deployment region |

---

## 12. Failure Handling

### 12.1 Failure Matrix

| Failure Scenario | Detection | Response | Recovery |
|------------------|-----------|----------|----------|
| **Outlook webhook down** | Health check fails | Switch to polling mode | Auto-switch back when healthy |
| **Outlook API rate limit** | 429 response | Exponential backoff | Queue overflow handling |
| **Email parsing error** | Parse exception | Quarantine email | Human review queue |
| **LLM timeout** | Context deadline | Retry with shorter prompt | Fallback to rule-based |
| **LLM invalid response** | Schema validation fail | Retry up to 3x | Human classification |
| **Low confidence classification** | Confidence < 0.5 | Route to human | Learn from correction |
| **Client match failure** | No match found | Human assignment | Learn mapping |
| **QuickBooks API down** | Circuit breaker open | Queue for retry | Alert + batch retry |
| **QuickBooks rate limit** | 429 response | Backoff + queue | Spread requests |
| **Bill.com API down** | Circuit breaker open | Queue for retry | Alert + batch retry |
| **Partial saga failure** | Step returns error | Execute compensations | Mark as rolled back |
| **Compensation failure** | Compensation errors | Alert + freeze | Manual intervention |
| **Database connection lost** | Connection error | Retry with backoff | Failover to replica |
| **Redis down** | Connection error | Fallback to DB | Graceful degradation |
| **Worker crash** | Heartbeat timeout | Requeue job | New worker picks up |
| **Duplicate email** | Message-ID exists | Skip processing | Log and ignore |
| **Invalid financial data** | Validation rules | Block action | Human correction |

### 12.2 Circuit Breaker Configuration

```typescript
interface BreakerSettings {
  maxRequests: number;      // Requests allowed in half-open state
  intervalMs: number;       // Time window for failure counting
  timeoutMs: number;        // Time before half-open attempt
  failureThreshold: number; // Failures before opening
  successThreshold: number; // Successes needed to close
}

const circuitBreakerConfig: Record<string, BreakerSettings> = {
  quickbooks: {
    maxRequests: 5,
    intervalMs: 10_000,
    timeoutMs: 30_000,
    failureThreshold: 3,
    successThreshold: 2,
  },

  billcom: {
    maxRequests: 5,
    intervalMs: 10_000,
    timeoutMs: 30_000,
    failureThreshold: 3,
    successThreshold: 2,
  },

  anthropic: {
    maxRequests: 10,
    intervalMs: 5_000,
    timeoutMs: 60_000,
    failureThreshold: 5,
    successThreshold: 3,
  },
};
```

### 12.3 Retry Strategies

```typescript
interface RetrySettings {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: number;           // Random jitter factor (0.1 = 10%)
  retryableErrors: string[];
}

const retryConfig = {
  // External API calls
  externalAPI: {
    maxAttempts: 5,
    initialDelayMs: 1_000,
    maxDelayMs: 30_000,
    multiplier: 2.0,
    jitter: 0.1,
    retryableErrors: ['timeout', '503', '429', 'connection_reset', 'ECONNRESET'],
  },

  // LLM calls
  llm: {
    maxAttempts: 3,
    initialDelayMs: 2_000,
    maxDelayMs: 10_000,
    multiplier: 2.0,
    jitter: 0.2,
    retryableErrors: ['timeout', 'overloaded', 'rate_limit'],
  },

  // Database operations
  database: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 1_000,
    multiplier: 2.0,
    jitter: 0.1,
    retryableErrors: ['connection_reset', 'deadlock', 'ECONNRESET'],
  },
} satisfies Record<string, RetrySettings>;

// Retry utility with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  settings: RetrySettings
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < settings.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const isRetryable = settings.retryableErrors.some(
        (e) => lastError?.message.includes(e)
      );
      if (!isRetryable || attempt === settings.maxAttempts - 1) {
        throw lastError;
      }

      const delay = Math.min(
        settings.initialDelayMs * Math.pow(settings.multiplier, attempt),
        settings.maxDelayMs
      );
      const jitteredDelay = delay * (1 + (Math.random() - 0.5) * settings.jitter * 2);
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }

  throw lastError;
}
```

### 12.4 Dead Letter Queue

Failed jobs that exhaust retries go to DLQ for manual review:

```typescript
interface ErrorRecord {
  timestamp: Date;
  message: string;
  stack?: string;
  attempt: number;
}

interface DeadLetterEntry {
  id: string;
  originalJobId: string;
  jobType: string;
  payload: Record<string, unknown>;

  failureCount: number;
  lastError: string;
  errorHistory: ErrorRecord[];

  createdAt: Date;
  expiresAt: Date;  // Auto-delete after 30 days

  // Resolution
  status: 'pending' | 'resolved' | 'discarded';
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: string;
}

// BullMQ DLQ handling
const dlqProcessor = async (job: Job<DeadLetterEntry>) => {
  const entry = job.data;

  // Send alert for critical failures
  await alertService.send({
    type: 'dlq_entry',
    severity: 'warning',
    message: `Job ${entry.jobType} failed after ${entry.failureCount} attempts`,
    metadata: { jobId: entry.originalJobId, lastError: entry.lastError },
  });

  // Store in database for dashboard review
  await dlqRepository.create(entry);
};
```

---

## 13. Observability

### 13.1 Metrics

```yaml
# Prometheus metrics
metrics:
  # Email processing
  - name: emails_received_total
    type: counter
    labels: [source]  # webhook, poll

  - name: emails_processed_total
    type: counter
    labels: [status, classification]

  - name: email_processing_duration_seconds
    type: histogram
    buckets: [0.5, 1, 2, 5, 10, 30, 60]

  # LLM
  - name: llm_requests_total
    type: counter
    labels: [operation, status]  # classify, extract, success, error

  - name: llm_request_duration_seconds
    type: histogram
    labels: [operation]

  - name: llm_tokens_used_total
    type: counter
    labels: [operation, token_type]  # input, output

  - name: llm_confidence_score
    type: histogram
    labels: [operation]
    buckets: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]

  # Client matching
  - name: client_matches_total
    type: counter
    labels: [method, success]  # explicit, domain, llm, unmatched

  # Risk & approval
  - name: actions_by_risk_level
    type: counter
    labels: [risk_level, action_type]

  - name: approval_queue_size
    type: gauge
    labels: [risk_level]

  - name: approval_wait_duration_seconds
    type: histogram
    labels: [risk_level]

  # External APIs
  - name: external_api_requests_total
    type: counter
    labels: [service, endpoint, status]

  - name: external_api_duration_seconds
    type: histogram
    labels: [service, endpoint]

  - name: circuit_breaker_state
    type: gauge
    labels: [service]  # 0=closed, 1=half-open, 2=open

  # Saga execution
  - name: sagas_total
    type: counter
    labels: [status]  # completed, failed, compensated

  - name: saga_duration_seconds
    type: histogram
    labels: [step_count]
```

### 13.2 Logging Standards

```typescript
import pino from 'pino';

// Structured logging with Pino
interface LogEvent {
  // Standard fields (always present)
  timestamp: string;
  level: string;
  message: string;
  service: string;
  version: string;

  // Tracing
  traceId?: string;
  spanId?: string;

  // Context
  emailId?: string;
  clientId?: string;
  actionId?: string;
  sagaId?: string;
  userId?: string;

  // Error details
  error?: string;
  stack?: string;

  // Performance
  durationMs?: number;
}

// Create logger with context
const createLogger = (service: string) =>
  pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
      service,
      version: process.env.APP_VERSION || '1.0.0',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });

// Log levels usage:
// DEBUG: Detailed debugging info (not in production)
// INFO:  Normal operational events
// WARN:  Recoverable issues, degraded functionality
// ERROR: Failures requiring attention
// FATAL: Unrecoverable errors, service shutdown
```

### 13.3 Distributed Tracing

```typescript
import { trace, SpanKind, Span } from '@opentelemetry/api';

// OpenTelemetry span structure
// Root span: HTTP request or job execution
// Child spans:
//   - email.parse
//   - llm.classify
//   - llm.extract
//   - client.match
//   - risk.evaluate
//   - saga.execute
//     - saga.step.1 (quickbooks.create_bill)
//     - saga.step.2 (billcom.create_bill)
//     - saga.step.3 (billcom.schedule_payment)
//   - audit.log

// Span attribute keys
const SpanAttributes = {
  EMAIL_ID: 'email.id',
  EMAIL_TYPE: 'email.type',
  CLIENT_ID: 'client.id',
  ACTION_TYPE: 'action.type',
  RISK_LEVEL: 'risk.level',
  LLM_MODEL: 'llm.model',
  LLM_TOKENS: 'llm.tokens',
  EXTERNAL_SERVICE: 'external.service',
} as const;

// Tracing utility
const tracer = trace.getTracer('ai-email-agent');

async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
      }
      const result = await fn(span);
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: String(error) }); // ERROR
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### 13.4 Alerting Rules

```yaml
# Alertmanager rules
alerts:
  - name: HighEmailBacklog
    condition: email_queue_size > 100
    for: 5m
    severity: warning
    notify: [slack]

  - name: CriticalEmailBacklog
    condition: email_queue_size > 500
    for: 10m
    severity: critical
    notify: [slack, pagerduty]

  - name: LLMHighErrorRate
    condition: rate(llm_requests_total{status="error"}[5m]) > 0.1
    for: 5m
    severity: warning
    notify: [slack]

  - name: ExternalAPIDown
    condition: circuit_breaker_state > 1
    for: 1m
    severity: critical
    notify: [slack, pagerduty]

  - name: HighApprovalBacklog
    condition: approval_queue_size{risk_level="critical"} > 10
    for: 1h
    severity: warning
    notify: [slack, email]

  - name: SagaCompensationFailure
    condition: increase(sagas_total{status="compensation_failed"}[1h]) > 0
    severity: critical
    notify: [slack, pagerduty, email]

  - name: DatabaseConnectionPoolExhausted
    condition: db_pool_available_connections < 5
    for: 1m
    severity: critical
    notify: [slack, pagerduty]
```

---

## 14. API Specification

### 14.1 REST API Endpoints

```yaml
openapi: 3.0.3
info:
  title: AI Email Agent API
  version: 2.0.0

paths:
  # Email endpoints
  /api/v1/emails:
    get:
      summary: List emails
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [pending, processing, completed, failed]
        - name: client_id
          in: query
          schema:
            type: string
            format: uuid
        - name: from_date
          in: query
          schema:
            type: string
            format: date
        - name: limit
          in: query
          schema:
            type: integer
            default: 50
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: List of emails
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EmailList'

  /api/v1/emails/{id}:
    get:
      summary: Get email details
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Email details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Email'

  # Review endpoints
  /api/v1/reviews:
    get:
      summary: List pending reviews
      parameters:
        - name: risk_level
          in: query
          schema:
            type: string
            enum: [low, medium, high, critical]
      responses:
        '200':
          description: List of pending reviews
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ReviewList'

  /api/v1/reviews/{id}/approve:
    post:
      summary: Approve an action
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                comment:
                  type: string
      responses:
        '200':
          description: Action approved

  /api/v1/reviews/{id}/reject:
    post:
      summary: Reject an action
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [reason]
              properties:
                reason:
                  type: string
      responses:
        '200':
          description: Action rejected

  # Client endpoints
  /api/v1/clients:
    get:
      summary: List clients
      responses:
        '200':
          description: List of clients

    post:
      summary: Create client
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ClientCreate'
      responses:
        '201':
          description: Client created

  /api/v1/clients/{id}/mappings:
    post:
      summary: Add email mapping for client
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email_pattern, pattern_type]
              properties:
                email_pattern:
                  type: string
                pattern_type:
                  type: string
                  enum: [exact, domain]
      responses:
        '201':
          description: Mapping created

  # Audit endpoints
  /api/v1/audit:
    get:
      summary: Query audit log
      parameters:
        - name: event_type
          in: query
          schema:
            type: string
        - name: email_id
          in: query
          schema:
            type: string
            format: uuid
        - name: from_date
          in: query
          schema:
            type: string
            format: date-time
        - name: to_date
          in: query
          schema:
            type: string
            format: date-time
      responses:
        '200':
          description: Audit log entries

  # Webhook endpoint
  /api/v1/webhooks/outlook:
    post:
      summary: Outlook webhook receiver
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/OutlookNotification'
      responses:
        '200':
          description: Notification received

  # Health endpoints
  /health:
    get:
      summary: Health check
      responses:
        '200':
          description: Service healthy

  /ready:
    get:
      summary: Readiness check
      responses:
        '200':
          description: Service ready
```

### 14.2 WebSocket API

```typescript
// Real-time updates for dashboard
interface WebSocketMessages {
  // Server → Client
  'email.new': {
    email_id: string;
    subject: string;
    sender: string;
    received_at: string;
  };

  'email.status_changed': {
    email_id: string;
    old_status: string;
    new_status: string;
  };

  'review.new': {
    action_id: string;
    email_id: string;
    risk_level: string;
    action_type: string;
    amount?: number;
  };

  'review.completed': {
    action_id: string;
    decision: 'approved' | 'rejected';
    by: string;
  };

  'metrics.update': {
    pending_emails: number;
    pending_reviews: number;
    processed_today: number;
    actions_today: number;
  };

  // Client → Server
  'subscribe': {
    channels: string[];  // ['emails', 'reviews', 'metrics']
  };

  'unsubscribe': {
    channels: string[];
  };
}
```

---

## 15. Project Structure

```
ai-email-agent/
├── apps/
│   ├── server/                       # Main API server (Fastify)
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point
│   │   │   ├── app.ts                # Fastify app setup
│   │   │   ├── routes/
│   │   │   │   ├── emails.ts
│   │   │   │   ├── reviews.ts
│   │   │   │   ├── clients.ts
│   │   │   │   ├── audit.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   └── health.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── logging.ts
│   │   │   │   └── error-handler.ts
│   │   │   └── websocket/
│   │   │       └── hub.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── worker/                       # Background job processor (BullMQ)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── processors/
│   │   │   │   ├── process-email.ts
│   │   │   │   ├── execute-action.ts
│   │   │   │   └── cleanup.ts
│   │   │   └── queues.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── dashboard/                    # React dashboard
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/               # shadcn components
│       │   │   ├── email-list.tsx
│       │   │   ├── review-panel.tsx
│       │   │   ├── client-selector.tsx
│       │   │   └── audit-log.tsx
│       │   ├── pages/
│       │   │   ├── dashboard.tsx
│       │   │   ├── reviews.tsx
│       │   │   ├── clients.tsx
│       │   │   └── settings.tsx
│       │   ├── hooks/
│       │   │   ├── use-emails.ts
│       │   │   ├── use-reviews.ts
│       │   │   └── use-websocket.ts
│       │   ├── lib/
│       │   │   └── api-client.ts
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── public/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── tailwind.config.js
│
├── packages/
│   ├── core/                         # Shared domain types & business logic
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── email.ts
│   │   │   │   ├── client.ts
│   │   │   │   ├── action.ts
│   │   │   │   ├── saga.ts
│   │   │   │   └── audit.ts
│   │   │   ├── services/
│   │   │   │   ├── classifier.ts
│   │   │   │   ├── extractor.ts
│   │   │   │   ├── matcher.ts
│   │   │   │   ├── planner.ts
│   │   │   │   ├── validator.ts
│   │   │   │   └── saga-executor.ts
│   │   │   ├── schemas/
│   │   │   │   ├── classification.ts
│   │   │   │   ├── extraction.ts
│   │   │   │   └── api.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── integrations/                 # External API clients
│   │   ├── src/
│   │   │   ├── outlook/
│   │   │   │   ├── client.ts
│   │   │   │   ├── auth.ts
│   │   │   │   └── types.ts
│   │   │   ├── quickbooks/
│   │   │   │   ├── client.ts
│   │   │   │   ├── auth.ts
│   │   │   │   └── types.ts
│   │   │   ├── billcom/
│   │   │   │   ├── client.ts
│   │   │   │   └── types.ts
│   │   │   ├── anthropic/
│   │   │   │   ├── client.ts
│   │   │   │   ├── prompts.ts
│   │   │   │   └── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── database/                     # Database layer (Drizzle ORM)
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── emails.ts
│   │   │   │   ├── clients.ts
│   │   │   │   ├── actions.ts
│   │   │   │   ├── sagas.ts
│   │   │   │   └── audit.ts
│   │   │   ├── repositories/
│   │   │   │   ├── email-repository.ts
│   │   │   │   ├── client-repository.ts
│   │   │   │   ├── action-repository.ts
│   │   │   │   ├── saga-repository.ts
│   │   │   │   └── audit-repository.ts
│   │   │   ├── migrations/
│   │   │   │   ├── 0001_initial_schema.ts
│   │   │   │   └── 0002_add_audit_log.ts
│   │   │   ├── db.ts
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── config/                       # Shared configuration
│   │   ├── src/
│   │   │   ├── env.ts                # Type-safe env vars
│   │   │   ├── risk-policy.ts        # Risk policy loader
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── utils/                        # Shared utilities
│       ├── src/
│       │   ├── result.ts             # Result type
│       │   ├── retry.ts              # Retry with backoff
│       │   ├── circuit-breaker.ts
│       │   ├── logger.ts             # Pino wrapper
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── config/                           # Configuration files
│   ├── risk-policy.yaml
│   └── logging.yaml
│
├── deploy/                           # Deployment configs
│   ├── docker/
│   │   ├── Dockerfile.server
│   │   ├── Dockerfile.worker
│   │   └── docker-compose.yml
│   ├── k8s/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   └── secrets.yaml
│   └── terraform/
│       └── main.tf
│
├── scripts/
│   ├── setup.sh
│   ├── db-migrate.ts
│   └── db-seed.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── api.md
│   ├── deployment.md
│   └── runbook.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── package.json                      # Root package.json (workspaces)
├── pnpm-workspace.yaml               # pnpm workspace config
├── turbo.json                        # Turborepo config
├── tsconfig.base.json                # Shared TypeScript config
├── .eslintrc.js
├── .prettierrc
└── README.md
```

---

## 16. Deployment

### 16.1 Docker Configuration

```dockerfile
# Dockerfile.server
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json tsconfig.base.json ./

# Copy package.json files for all packages
COPY apps/server/package.json ./apps/server/
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/config/package.json ./packages/config/
COPY packages/utils/package.json ./packages/utils/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN pnpm turbo build --filter=server

# Runtime image
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built artifacts
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/config ./config

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### 16.2 Docker Compose (Development/Single Node)

```yaml
# docker-compose.yml
version: '3.8'

services:
  server:
    build:
      context: .
      dockerfile: deploy/docker/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/emailagent?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio:9000
    depends_on:
      - db
      - redis
      - minio
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: deploy/docker/Dockerfile
    command: ["/app/worker"]
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/emailagent?sslmode=disable
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    restart: unless-stopped
    deploy:
      replicas: 3

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=emailagent
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  prometheus:
    image: prom/prometheus
    volumes:
      - ./deploy/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  redis_data:
  minio_data:
  grafana_data:
```

### 16.3 Resource Requirements

| Environment | Server | Workers | Database | Redis | Total |
|-------------|--------|---------|----------|-------|-------|
| Development | 1 CPU, 512MB | 1x (1 CPU, 256MB) | 1 CPU, 1GB | 1 CPU, 256MB | 4 CPU, 2GB |
| Production | 2 CPU, 1GB | 3x (1 CPU, 512MB) | 2 CPU, 4GB | 1 CPU, 512MB | 8 CPU, 7GB |

---

## 17. Development Workflow

### 17.1 Local Setup

```bash
# Clone repository
git clone https://github.com/org/ai-email-agent.git
cd ai-email-agent

# Install pnpm (if not already installed)
corepack enable
corepack prepare pnpm@latest --activate

# Install dependencies
pnpm install

# Start infrastructure
docker-compose up -d db redis minio

# Run database migrations
pnpm db:migrate

# Generate Drizzle types
pnpm db:generate

# Start all services in development mode
pnpm dev

# Or start individually:
pnpm --filter server dev      # API server
pnpm --filter worker dev      # Background worker
pnpm --filter dashboard dev   # React dashboard
```

### 17.2 Testing Strategy

```yaml
testing:
  unit:
    coverage_target: 80%
    focus:
      - Business logic in service/
      - Risk rule evaluation
      - Client matching algorithms
      - Saga state machine

  integration:
    coverage_target: 60%
    focus:
      - Database operations
      - Job queue behavior
      - API endpoints

  e2e:
    scenarios:
      - Full email processing pipeline
      - Approval workflow
      - Saga execution and rollback
      - External API failure handling

  load:
    tool: k6
    scenarios:
      - 1000 emails/day sustained
      - 100 emails/hour burst
      - Concurrent approvals
```

### 17.3 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run type check
        run: pnpm typecheck

      - name: Run linting
        run: pnpm lint

      - name: Run tests
        run: pnpm test
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379

      - name: Upload coverage
        uses: codecov/codecov-action@v4

  build:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker images
        run: |
          docker build -f deploy/docker/Dockerfile.server -t ai-email-agent-server .
          docker build -f deploy/docker/Dockerfile.worker -t ai-email-agent-worker .
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Saga** | A sequence of local transactions with compensating actions for rollback |
| **Circuit Breaker** | Pattern to prevent cascade failures by stopping calls to failing services |
| **Idempotent** | Operation that produces same result regardless of how many times executed |
| **Cold Start** | Initial system state with no historical data for ML/matching |
| **Compensation** | Action that undoes the effect of a previous action |
| **DLQ** | Dead Letter Queue - storage for messages that failed processing |

---

## Appendix B: Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2024-01-04 | TypeScript over Python/Go | Type safety, same language for full stack, excellent async handling, fast iteration | Go (better perf), Python (ML ecosystem), Rust (overkill) |
| 2024-01-04 | BullMQ for job queue | Redis-backed, mature, excellent TypeScript support, reliable | PostgreSQL-based (pg-boss), RabbitMQ |
| 2024-01-04 | Drizzle ORM | Type-safe, SQL-like syntax, good performance, excellent DX | Prisma (slower), TypeORM (heavier), raw SQL |
| 2024-01-04 | Fastify over Express | Better performance, native TypeScript, schema validation | Express (more middleware), Hono (newer) |
| 2024-01-04 | pnpm + Turborepo | Fast installs, monorepo support, caching | npm workspaces, yarn, nx |
| 2024-01-04 | Saga pattern for multi-step actions | Clear compensation path, audit trail | 2PC, simple retries |
| 2024-01-04 | YAML risk policy | Non-developer configurable, version controlled | Hardcoded, database rules |
| 2024-01-04 | Zod for validation | Runtime type safety, excellent TypeScript inference | Yup, io-ts, class-validator |

---

## Appendix C: References

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/)
- [QuickBooks Online API](https://developer.intuit.com/app/developer/qbo/docs/get-started)
- [Bill.com API](https://developer.bill.com/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [River Job Queue](https://riverqueue.com/docs)
- [sqlc Documentation](https://docs.sqlc.dev/)

---

**Document Version:** 2.0
**Last Updated:** 2024-01-04
**Authors:** AI Email Agent Development Team
