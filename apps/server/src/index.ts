import { createLogger } from '@ai-email-agent/utils';
import { getEnv } from '@ai-email-agent/config';
import { closeDb } from '@ai-email-agent/database';
import { buildApp } from './app.js';

const logger = createLogger({ service: 'server' });

async function main() {
  const env = getEnv();
  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info({ signal }, 'Received shutdown signal');
      await app.close();
      await closeDb();
      process.exit(0);
    });
  }

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
    logger.info({ host: env.HOST, port: env.PORT }, 'Server started');
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
