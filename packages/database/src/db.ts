import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { getPartialEnv } from '@ai-email-agent/config';
import * as schema from './schema/index.js';

export { sql };

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;
let queryClient: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!db) {
    const env = getPartialEnv();
    queryClient = postgres(env.DATABASE_URL, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    db = drizzle(queryClient, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (queryClient) {
    await queryClient.end();
    queryClient = undefined;
    db = undefined;
  }
}

export { schema };
export type Database = ReturnType<typeof getDb>;
