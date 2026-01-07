import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  createCircuitBreaker,
  circuitBreakerPresets,
  type CircuitBreakerOptions,
} from './circuit-breaker.js';
import { isOk, isErr } from './result.js';

describe('CircuitBreaker', () => {
  const defaultOptions: CircuitBreakerOptions = {
    name: 'test-circuit',
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 1000,
    resetTimeoutMs: 5000,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('closed state', () => {
    it('executes function successfully when closed', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockResolvedValue('success');

      const result = await cb.execute(fn);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('success');
      }
      expect(fn).toHaveBeenCalled();
      expect(cb.getState()).toBe('closed');
    });

    it('returns error but stays closed below threshold', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await cb.execute(fn);
      await cb.execute(fn);

      expect(cb.getState()).toBe('closed');
      expect(cb.getStats().failureCount).toBe(2);
    });

    it('opens after reaching failure threshold', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await cb.execute(fn);
      }

      expect(cb.getState()).toBe('open');
    });

    it('resets failure count on success', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const failingFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('ok');

      await cb.execute(failingFn);
      await cb.execute(failingFn);
      expect(cb.getStats().failureCount).toBe(2);

      await cb.execute(successFn);
      expect(cb.getStats().failureCount).toBe(0);
    });
  });

  describe('open state', () => {
    it('rejects calls immediately when open', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await cb.execute(fn);
      }
      expect(cb.getState()).toBe('open');

      // New call should be rejected without executing
      fn.mockClear();
      const result = await cb.execute(fn);

      expect(isErr(result)).toBe(true);
      if (isErr(result) && 'type' in result.error) {
        expect(result.error.type).toBe('circuit_open');
        expect(result.error.circuitName).toBe('test-circuit');
      }
      expect(fn).not.toHaveBeenCalled();
    });

    it('transitions to half-open after reset timeout', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await cb.execute(fn);
      }
      expect(cb.getState()).toBe('open');

      // Advance time past reset timeout
      vi.advanceTimersByTime(5001);

      // Next call should attempt (half-open)
      fn.mockResolvedValue('success');
      await cb.execute(fn);

      expect(fn).toHaveBeenCalled();
    });
  });

  describe('half-open state', () => {
    it('closes after success threshold met', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await cb.execute(fn);
      }

      // Advance to half-open
      vi.advanceTimersByTime(5001);
      fn.mockResolvedValue('success');

      // Execute success threshold times
      await cb.execute(fn);
      expect(cb.getState()).toBe('half-open');

      await cb.execute(fn);
      expect(cb.getState()).toBe('closed');
    });

    it('reopens on failure in half-open state', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await cb.execute(fn);
      }

      // Advance to half-open
      vi.advanceTimersByTime(5001);

      // Fail in half-open state
      await cb.execute(fn);
      expect(cb.getState()).toBe('open');
    });
  });

  describe('timeout', () => {
    it('fails on timeout', async () => {
      const cb = new CircuitBreaker({ ...defaultOptions, timeoutMs: 100 });
      const fn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 200))
      );

      const resultPromise = cb.execute(fn);
      vi.advanceTimersByTime(101);
      const result = await resultPromise;

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect((result.error as Error).message).toContain('timeout');
      }
    });
  });

  describe('state change callback', () => {
    it('calls onStateChange when state changes', async () => {
      const onStateChange = vi.fn();
      const cb = new CircuitBreaker({ ...defaultOptions, onStateChange });
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await cb.execute(fn);
      }

      expect(onStateChange).toHaveBeenCalledWith('test-circuit', 'closed', 'open');
    });
  });

  describe('reset', () => {
    it('resets circuit to initial state', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await cb.execute(fn);
      }
      expect(cb.getState()).toBe('open');

      cb.reset();

      expect(cb.getState()).toBe('closed');
      expect(cb.getStats().failureCount).toBe(0);
      expect(cb.getStats().successCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns current stats', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await cb.execute(fn);
      await cb.execute(fn);

      const stats = cb.getStats();
      expect(stats).toEqual({
        state: 'closed',
        failureCount: 2,
        successCount: 0,
      });
    });
  });
});

describe('createCircuitBreaker', () => {
  it('creates circuit breaker with defaults', () => {
    const cb = createCircuitBreaker('my-service');

    expect(cb.getState()).toBe('closed');
    expect(cb.getStats().failureCount).toBe(0);
  });

  it('creates circuit breaker with custom options', () => {
    const cb = createCircuitBreaker('my-service', { failureThreshold: 10 });

    expect(cb.getState()).toBe('closed');
  });
});

describe('circuitBreakerPresets', () => {
  it('has quickbooks preset', () => {
    expect(circuitBreakerPresets.quickbooks.failureThreshold).toBe(3);
    expect(circuitBreakerPresets.quickbooks.timeoutMs).toBe(30000);
  });

  it('has anthropic preset with higher limits', () => {
    expect(circuitBreakerPresets.anthropic.failureThreshold).toBe(5);
    expect(circuitBreakerPresets.anthropic.timeoutMs).toBe(60000);
    expect(circuitBreakerPresets.anthropic.successThreshold).toBe(3);
  });

  it('has billcom preset', () => {
    expect(circuitBreakerPresets.billcom.failureThreshold).toBe(3);
  });

  it('has outlook preset', () => {
    expect(circuitBreakerPresets.outlook.failureThreshold).toBe(3);
  });
});
