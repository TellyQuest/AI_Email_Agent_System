import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';

// Load .env file
dotenvConfig();

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis (optional - pgBoss uses PostgreSQL for queues)
  REDIS_URL: z.string().optional().default(''),

  // External APIs - Required
  GROQ_API_KEY: z.string().min(1),

  // External APIs - Optional (configure when ready to use)
  OUTLOOK_CLIENT_ID: z.string().optional().default(''),
  OUTLOOK_CLIENT_SECRET: z.string().optional().default(''),
  OUTLOOK_TENANT_ID: z.string().optional().default(''),
  QUICKBOOKS_CLIENT_ID: z.string().optional().default(''),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional().default(''),
  BILLCOM_API_KEY: z.string().optional().default(''),
  BILLCOM_ORG_ID: z.string().optional().default(''),

  // MinIO / S3 - Optional for Railway (can use Railway volumes or external S3)
  MINIO_ENDPOINT: z.string().optional().default(''),
  MINIO_ACCESS_KEY: z.string().optional().default(''),
  MINIO_SECRET_KEY: z.string().optional().default(''),
  MINIO_BUCKET: z.string().default('email-attachments'),
  MINIO_USE_SSL: z.coerce.boolean().default(false),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Application
  APP_VERSION: z.string().default('1.0.0'),
  SERVICE_NAME: z.string().default('ai-email-agent'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables');
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

// Partial env for development - allows missing optional values
const partialEnvSchema = envSchema.partial().required({
  NODE_ENV: true,
  DATABASE_URL: true,
  GROQ_API_KEY: true,
});

export function getPartialEnv(): Partial<Env> & { NODE_ENV: string; DATABASE_URL: string; GROQ_API_KEY: string } {
  const parsed = partialEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables');
  }

  return parsed.data as Partial<Env> & { NODE_ENV: string; DATABASE_URL: string; GROQ_API_KEY: string };
}

// Type-safe env access
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
