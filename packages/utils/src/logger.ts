import pino, { Logger as PinoLogger } from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  service?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  emailId?: string;
  clientId?: string;
  actionId?: string;
  sagaId?: string;
  userId?: string;
}

const isDevelopment = process.env['NODE_ENV'] !== 'production';

const loggerOptions: pino.LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env['SERVICE_NAME'] ?? 'ai-email-agent',
    version: process.env['APP_VERSION'] ?? '1.0.0',
  },
};

if (isDevelopment) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

const baseLogger = pino(loggerOptions);

export type Logger = PinoLogger;

export const logger: Logger = baseLogger;

export function createLogger(context: LogContext): Logger {
  return baseLogger.child(context);
}

export function createChildLogger(parent: Logger, context: LogContext): Logger {
  return parent.child(context);
}

// Utility to create a logger with request context
export function createRequestLogger(requestId: string, context?: Partial<LogContext>): Logger {
  return createLogger({
    requestId,
    ...context,
  });
}

// Utility to measure and log duration
export async function withTiming<T>(
  log: Logger,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - startTime);
    log.info({ operation, durationMs }, `${operation} completed`);
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    log.error({ operation, durationMs, error }, `${operation} failed`);
    throw error;
  }
}
