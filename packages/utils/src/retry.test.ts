import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, retryPresets, defaultRetryOptions } from './retry.js';
import { isOk, isErr } from './result.js';

describe('Retry utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withRetry', () => {
    it('returns Ok on immediate success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const resultPromise = withRetry(fn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('success');
      }
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100 });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('success');
      }
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('returns Err after exhausting all attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      const resultPromise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100 });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('retry_exhausted');
        expect(result.error.attempts).toBe(3);
        expect(result.error.lastError.message).toBe('always fails');
      }
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('respects maxAttempts option', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      const resultPromise = withRetry(fn, { maxAttempts: 5, initialDelayMs: 10 });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(isErr(result)).toBe(true);
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('calls onRetry callback on each retry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValue('success');
      const onRetry = vi.fn();

      const resultPromise = withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onRetry,
      });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
    });

    it('only retries retryable errors when specified', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('non-retryable error'));

      const resultPromise = withRetry(fn, {
        maxAttempts: 3,
        retryableErrors: ['timeout', 'ECONNRESET'],
        initialDelayMs: 10,
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(isErr(result)).toBe(true);
      expect(fn).toHaveBeenCalledTimes(1); // No retries because error is not retryable
    });

    it('retries errors that match retryableErrors', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('connection timeout'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(fn, {
        maxAttempts: 3,
        retryableErrors: ['timeout'],
        initialDelayMs: 10,
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('converts non-Error throws to Error', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      const resultPromise = withRetry(fn, { maxAttempts: 1 });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.lastError).toBeInstanceOf(Error);
      }
    });
  });

  describe('defaultRetryOptions', () => {
    it('has sensible defaults', () => {
      expect(defaultRetryOptions.maxAttempts).toBe(3);
      expect(defaultRetryOptions.initialDelayMs).toBe(1000);
      expect(defaultRetryOptions.maxDelayMs).toBe(30000);
      expect(defaultRetryOptions.multiplier).toBe(2);
      expect(defaultRetryOptions.jitter).toBe(0.1);
    });
  });

  describe('retryPresets', () => {
    it('has externalApi preset', () => {
      expect(retryPresets.externalApi.maxAttempts).toBe(5);
      expect(retryPresets.externalApi.retryableErrors).toContain('timeout');
      expect(retryPresets.externalApi.retryableErrors).toContain('429');
    });

    it('has llm preset with higher timeout tolerance', () => {
      expect(retryPresets.llm.maxAttempts).toBe(3);
      expect(retryPresets.llm.initialDelayMs).toBe(2000);
      expect(retryPresets.llm.retryableErrors).toContain('overloaded');
    });

    it('has database preset with fast retries', () => {
      expect(retryPresets.database.maxAttempts).toBe(3);
      expect(retryPresets.database.initialDelayMs).toBe(100);
      expect(retryPresets.database.maxDelayMs).toBe(1000);
    });
  });
});
