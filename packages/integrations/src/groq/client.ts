import Groq from 'groq-sdk';
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
import { Classification, ExtractedData, EmailDomain, EmailType, UrgencyLevel } from '../types.js';
import { z } from 'zod';

const logger = createLogger({ service: 'groq-client' });

// LLM API errors
export interface LLMError {
  code: string;
  message: string;
  retryable: boolean;
}

// Classification output schema
const ClassificationOutputSchema = z.object({
  email_type: z.enum(['invoice', 'receipt', 'payment_notice', 'bank_notice', 'inquiry', 'irrelevant']),
  intent: z.string(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// Extraction output schema
const ConfidentValueSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['subject', 'body', 'attachment', 'inferred']),
});

const ExtractionOutputSchema = z.object({
  vendor_name: ConfidentValueSchema,
  amount: ConfidentValueSchema,
  currency: ConfidentValueSchema,
  due_date: ConfidentValueSchema,
  invoice_number: ConfidentValueSchema,
  description: ConfidentValueSchema,
  line_items: z.array(z.object({
    description: z.string(),
    amount: z.string(),
    quantity: z.number().optional(),
  })),
  overall_confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export class GroqClient {
  private client: Groq;
  private circuitBreaker: CircuitBreaker;
  // Using llama-3.3-70b-versatile for best quality, or llama-3.1-8b-instant for speed
  private defaultModel = 'llama-3.3-70b-versatile';

  constructor() {
    const env = getEnv();
    this.client = new Groq({
      apiKey: env.GROQ_API_KEY,
    });
    this.circuitBreaker = createCircuitBreaker('groq', circuitBreakerPresets.anthropic);
  }

  async classify(email: EmailDomain): Promise<Result<Classification, LLMError>> {
    const prompt = this.buildClassificationPrompt(email);

    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          const response = await this.client.chat.completions.create({
            model: this.defaultModel,
            max_tokens: 1024,
            temperature: 0.1,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          });

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error('No content in response');
          }

          return content;
        },
        retryPresets.llm
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'LLM_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
        retryable: true,
      });
    }

    // Parse JSON from response
    const parsed = this.parseJsonFromResponse(cbResult.value);
    if (!parsed.ok) {
      return err({
        code: 'PARSE_ERROR',
        message: parsed.error,
        retryable: false,
      });
    }

    // Validate against schema
    const validated = ClassificationOutputSchema.safeParse(parsed.value);
    if (!validated.success) {
      logger.warn({ error: validated.error.format() }, 'Classification validation failed');
      return err({
        code: 'VALIDATION_ERROR',
        message: 'Invalid classification output',
        retryable: false,
      });
    }

    return ok({
      emailType: validated.data.email_type as EmailType,
      intent: validated.data.intent,
      urgency: validated.data.urgency as UrgencyLevel,
      confidence: validated.data.confidence,
      reasoning: validated.data.reasoning,
    });
  }

  async extract(
    email: EmailDomain,
    classification: Classification
  ): Promise<Result<ExtractedData, LLMError>> {
    const prompt = this.buildExtractionPrompt(email, classification);

    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          const response = await this.client.chat.completions.create({
            model: this.defaultModel,
            max_tokens: 2048,
            temperature: 0.1,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          });

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error('No content in response');
          }

          return content;
        },
        retryPresets.llm
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'LLM_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
        retryable: true,
      });
    }

    // Parse JSON from response
    const parsed = this.parseJsonFromResponse(cbResult.value);
    if (!parsed.ok) {
      return err({
        code: 'PARSE_ERROR',
        message: parsed.error,
        retryable: false,
      });
    }

    // Validate against schema
    const validated = ExtractionOutputSchema.safeParse(parsed.value);
    if (!validated.success) {
      logger.warn({ error: validated.error.format() }, 'Extraction validation failed');
      return err({
        code: 'VALIDATION_ERROR',
        message: 'Invalid extraction output',
        retryable: false,
      });
    }

    const data = validated.data;
    return ok({
      vendorName: {
        value: data.vendor_name.value,
        confidence: data.vendor_name.confidence,
        source: data.vendor_name.source,
      },
      amount: {
        value: data.amount.value,
        confidence: data.amount.confidence,
        source: data.amount.source,
      },
      currency: {
        value: data.currency.value,
        confidence: data.currency.confidence,
        source: data.currency.source,
      },
      dueDate: {
        value: data.due_date.value,
        confidence: data.due_date.confidence,
        source: data.due_date.source,
      },
      invoiceNumber: {
        value: data.invoice_number.value,
        confidence: data.invoice_number.confidence,
        source: data.invoice_number.source,
      },
      description: {
        value: data.description.value,
        confidence: data.description.confidence,
        source: data.description.source,
      },
      lineItems: data.line_items,
      attachments: email.attachments,
      overallConfidence: data.overall_confidence,
      warnings: data.warnings,
    });
  }

  private buildClassificationPrompt(email: EmailDomain): string {
    return `You are an expert bookkeeper assistant. Analyze the following email and classify it.

EMAIL:
From: ${email.senderEmail} (${email.senderName ?? 'Unknown'})
Subject: ${email.subject}
Date: ${email.receivedAt.toISOString()}

Body:
${email.bodyText ?? '(no text content)'}

Classify this email into exactly one category:
- invoice: A bill or invoice requesting payment
- receipt: A payment confirmation or receipt
- payment_notice: Notification about payment status
- bank_notice: Bank statement or notification
- inquiry: Question or request requiring response
- irrelevant: Spam, marketing, or unrelated to bookkeeping

Respond with ONLY valid JSON (no markdown, no explanation) matching this exact schema:
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
- Receipt detection should look for: "thank you for your payment", confirmation numbers`;
  }

  private buildExtractionPrompt(email: EmailDomain, classification: Classification): string {
    return `You are an expert bookkeeper assistant. Extract financial data from this email.

EMAIL TYPE: ${classification.emailType}
From: ${email.senderEmail} (${email.senderName ?? 'Unknown'})
Subject: ${email.subject}

Body:
${email.bodyText ?? '(no text content)'}

${email.hasAttachments ? `\nThis email has ${email.attachments.length} attachment(s).` : ''}

Extract all relevant financial information. For each field, provide:
- value: the extracted value (use null if not found)
- confidence: 0.0 to 1.0 (how certain you are)
- source: where you found this ("subject", "body", "attachment", "inferred")

Respond with ONLY valid JSON (no markdown, no explanation) matching this schema:
{
  "vendor_name": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "amount": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "currency": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "due_date": {"value": "string|null (ISO format)", "confidence": 0.0-1.0, "source": "string"},
  "invoice_number": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "description": {"value": "string|null", "confidence": 0.0-1.0, "source": "string"},
  "line_items": [{"description": "string", "amount": "string", "quantity": number}],
  "overall_confidence": 0.0-1.0,
  "warnings": ["array of any concerns or ambiguities"]
}

Important:
- Be conservative with confidence scores
- Preserve exact amount format (e.g., "$1,234.56" -> "1234.56")
- Use ISO format for dates (YYYY-MM-DD)
- Include warnings for any unclear or potentially incorrect data`;
  }

  async summarizeClientEmails(
    clientName: string,
    emails: Array<{
      subject: string;
      senderEmail: string;
      receivedAt: Date;
      classification?: { emailType: string; urgency: string } | null;
      extractedData?: { amount?: { value: string | null }; vendorName?: { value: string | null } } | null;
    }>,
    stats: {
      total: number;
      byType: Record<string, number>;
      totalAmount: number;
      pendingAmount: number;
    }
  ): Promise<Result<{ summary: string; highlights: string[]; recommendations: string[] }, LLMError>> {
    const emailList = emails.slice(0, 20).map((e, i) =>
      `${i + 1}. [${e.classification?.emailType ?? 'unknown'}] ${e.subject} from ${e.senderEmail} (${e.classification?.urgency ?? 'medium'} priority)${e.extractedData?.amount?.value ? ` - $${e.extractedData.amount.value}` : ''}`
    ).join('\n');

    const prompt = `You are a bookkeeping assistant. Summarize the recent email activity for client "${clientName}".

STATISTICS:
- Total emails: ${stats.total}
- By type: ${Object.entries(stats.byType).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Total amount: $${stats.totalAmount.toFixed(2)}
- Pending amount: $${stats.pendingAmount.toFixed(2)}

RECENT EMAILS:
${emailList}

Provide a JSON response with:
{
  "summary": "A 2-3 sentence executive summary of the client's email activity",
  "highlights": ["Array of 3-5 key highlights or important items requiring attention"],
  "recommendations": ["Array of 2-3 actionable recommendations for the bookkeeper"]
}

Respond with ONLY valid JSON (no markdown, no explanation).`;

    const cbResult = await this.circuitBreaker.execute(async () => {
      const result = await withRetry(
        async () => {
          const response = await this.client.chat.completions.create({
            model: this.defaultModel,
            max_tokens: 1024,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }],
          });

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error('No content in response');
          }
          return content;
        },
        retryPresets.llm
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    });

    if (!cbResult.ok) {
      return err({
        code: 'LLM_ERROR',
        message: cbResult.error instanceof Error ? cbResult.error.message : String(cbResult.error),
        retryable: true,
      });
    }

    const parsed = this.parseJsonFromResponse(cbResult.value);
    if (!parsed.ok) {
      return err({ code: 'PARSE_ERROR', message: parsed.error, retryable: false });
    }

    const data = parsed.value as { summary: string; highlights: string[]; recommendations: string[] };
    return ok({
      summary: data.summary ?? 'No summary available',
      highlights: data.highlights ?? [],
      recommendations: data.recommendations ?? [],
    });
  }

  private parseJsonFromResponse(text: string): Result<unknown, string> {
    try {
      // Try direct parse first
      return ok(JSON.parse(text));
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        const content = jsonMatch[1];
        if (content) {
          try {
            return ok(JSON.parse(content.trim()));
          } catch {
            return err('Failed to parse JSON from code block');
          }
        }
      }

      // Try to find JSON object in text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        const matchedText = objectMatch[0];
        if (matchedText) {
          try {
            return ok(JSON.parse(matchedText));
          } catch {
            return err('Failed to parse JSON object from text');
          }
        }
      }

      return err('No JSON found in response');
    }
  }
}

export const groqClient = new GroqClient();
