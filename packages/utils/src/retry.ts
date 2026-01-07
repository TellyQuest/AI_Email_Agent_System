import { Result, ok, err } from './result.js';
import { logger } from './logger.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: 0.1,
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const calculateDelay = (attempt: number, options: RetryOptions): number => {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  const jitterRange = cappedDelay * options.jitter;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(0, cappedDelay + jitter);
};

const isRetryableError = (error: Error, retryableErrors?: string[]): boolean => {
  if (!retryableErrors || retryableErrors.length === 0) {
    return true; // Retry all errors by default
  }
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  return retryableErrors.some(
    (e) => errorMessage.includes(e.toLowerCase()) || errorName.includes(e.toLowerCase())
  );
};

export interface RetryError {
  type: 'retry_exhausted';
  message: string;
  attempts: number;
  lastError: Error;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<Result<T, RetryError>> {
  const opts: RetryOptions = { ...defaultRetryOptions, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return ok(result);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      const isLastAttempt = attempt === opts.maxAttempts - 1;
      const shouldRetry = !isLastAttempt && isRetryableError(lastError, opts.retryableErrors);

      if (!shouldRetry) {
        break;
      }

      const delayMs = calculateDelay(attempt, opts);

      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delayMs);
      } else {
        logger.warn(
          { attempt: attempt + 1, maxAttempts: opts.maxAttempts, delayMs, error: lastError.message },
          'Retrying after error'
        );
      }

      await sleep(delayMs);
    }
  }

  return err({
    type: 'retry_exhausted',
    message: `Failed after ${opts.maxAttempts} attempts: ${lastError?.message}`,
    attempts: opts.maxAttempts,
    lastError: lastError!,
  });
}

// Retry presets for common scenarios
export const retryPresets = {
  externalApi: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    multiplier: 2,
    jitter: 0.1,
    retryableErrors: ['timeout', 'ECONNRESET', 'ECONNREFUSED', '503', '429', '500'],
  },
  llm: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 10000,
    multiplier: 2,
    jitter: 0.2,
    retryableErrors: ['timeout', 'overloaded', 'rate_limit', '529'],
  },
  database: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    multiplier: 2,
    jitter: 0.1,
    retryableErrors: ['ECONNRESET', 'deadlock', 'connection'],
  },
} as const satisfies Record<string, RetryOptions>;
