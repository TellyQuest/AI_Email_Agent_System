import { PgBoss } from 'pg-boss';
import { createLogger } from '@ai-email-agent/utils';
import { getEnv } from '@ai-email-agent/config';
import { closeDb } from '@ai-email-agent/database';
import { registerEmailWorker } from './workers/email-worker.js';
import { registerActionWorker } from './workers/action-worker.js';
import { registerSagaWorker } from './workers/saga-worker.js';

const logger = createLogger({ service: 'worker' });

async function main() {
  const env = getEnv();

  logger.info('Starting workers with pgBoss...');

  // Initialize pgBoss with PostgreSQL connection
  const boss = new PgBoss(env.DATABASE_URL);

  // Handle pgBoss errors
  boss.on('error', (error: Error) => {
    logger.error({ error }, 'pgBoss error');
  });

  // Start pgBoss
  await boss.start();
  logger.info('pgBoss started');

  // Register workers
  await registerEmailWorker(boss);
  await registerActionWorker(boss);
  await registerSagaWorker(boss);

  logger.info('All workers registered');

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info({ signal }, 'Received shutdown signal');

      // Stop pgBoss gracefully
      await boss.stop();
      await closeDb();

      logger.info('Workers shut down gracefully');
      process.exit(0);
    });
  }

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start workers');
  process.exit(1);
});
