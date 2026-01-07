import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createLogger } from '@ai-email-agent/utils';
import { getEnv } from '@ai-email-agent/config';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhook.js';
import { outlookRoutes } from './routes/outlook.js';
import { emailRoutes } from './routes/emails.js';
import { actionRoutes } from './routes/actions.js';
import { clientRoutes } from './routes/clients.js';
import { sagaRoutes } from './routes/sagas.js';
import { dashboardRoutes } from './routes/dashboard.js';

const logger = createLogger({ service: 'app' });

export async function buildApp() {
  const env = getEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: env.NODE_ENV !== 'production',
        },
      },
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Utility plugin
  await app.register(sensible);

  // API documentation
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'AI Email Agent API',
        description: 'API for the AI Email Agent bookkeeping system',
        version: env.APP_VERSION,
      },
      servers: [
        {
          url: `http://${env.HOST}:${env.PORT}`,
          description: 'Local server',
        },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'webhook', description: 'Outlook webhook endpoints' },
        { name: 'outlook', description: 'Outlook subscription management' },
        { name: 'emails', description: 'Email management' },
        { name: 'actions', description: 'Action management' },
        { name: 'clients', description: 'Client management' },
        { name: 'sagas', description: 'Saga management' },
        { name: 'dashboard', description: 'Dashboard data' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(webhookRoutes, { prefix: '/webhook' });
  await app.register(outlookRoutes, { prefix: '/api/outlook' });
  await app.register(emailRoutes, { prefix: '/api/emails' });
  await app.register(actionRoutes, { prefix: '/api/actions' });
  await app.register(clientRoutes, { prefix: '/api/clients' });
  await app.register(sagaRoutes, { prefix: '/api/sagas' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error({ error, requestId: request.id }, 'Request error');

    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: error.validation,
      });
    }

    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: error.name ?? 'Internal Server Error',
      message: env.NODE_ENV === 'production' ? 'An error occurred' : error.message,
    });
  });

  return app;
}
