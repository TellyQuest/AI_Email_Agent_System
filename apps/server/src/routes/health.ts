import { FastifyPluginAsync } from 'fastify';
import { getDb, sql } from '@ai-email-agent/database';
import { getEnv } from '@ai-email-agent/config';
import Redis from 'ioredis';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    {
      schema: {
        tags: ['health'],
        summary: 'Basic health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      const env = getEnv();
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: env.APP_VERSION,
      };
    }
  );

  app.get(
    '/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness check (checks dependencies)',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'boolean' },
                  redis: { type: 'boolean' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: { type: 'object' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const env = getEnv();
      const checks = {
        database: false,
        redis: false,
      };

      // Check database
      try {
        const db = getDb();
        await db.execute(sql`SELECT 1`);
        checks.database = true;
      } catch {
        checks.database = false;
      }

      // Check Redis
      try {
        const redis = new Redis.default(env.REDIS_URL);
        await redis.ping();
        await redis.quit();
        checks.redis = true;
      } catch {
        checks.redis = false;
      }

      const allHealthy = Object.values(checks).every((v) => v);

      if (!allHealthy) {
        return reply.status(503).send({
          status: 'unhealthy',
          checks,
          error: 'One or more dependencies are not available',
        });
      }

      return {
        status: 'ready',
        checks,
      };
    }
  );

  app.get(
    '/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      return { status: 'alive' };
    }
  );
};
