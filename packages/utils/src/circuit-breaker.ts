import { Result, ok, err } from './result.js';
import { logger } from './logger.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  resetTimeoutMs: number;
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreakerError {
  type: 'circuit_open';
  message: string;
  circuitName: string;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | undefined;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(fn: () => Promise<T>): Promise<Result<T, CircuitBreakerError | Error>> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open');
      } else {
        return err({
          type: 'circuit_open',
          message: `Circuit breaker '${this.options.name}' is open`,
          circuitName: this.options.name,
        });
      }
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return ok(result);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.onFailure();
      return err(error);
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Circuit breaker '${this.options.name}' timeout after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo('closed');
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.state === 'closed' && this.failureCount >= this.options.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    logger.info(
      { circuitName: this.options.name, from: oldState, to: newState },
      'Circuit breaker state change'
    );

    this.options.onStateChange?.(this.options.name, oldState, newState);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): { state: CircuitState; failureCount: number; successCount: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }
}

// Factory function with presets
export function createCircuitBreaker(
  name: string,
  options?: Partial<Omit<CircuitBreakerOptions, 'name'>>
): CircuitBreaker {
  return new CircuitBreaker({
    name,
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 30000,
    resetTimeoutMs: 60000,
    ...options,
  });
}

// Presets for common services
export const circuitBreakerPresets = {
  quickbooks: {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 30000,
    resetTimeoutMs: 30000,
  },
  billcom: {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 30000,
    resetTimeoutMs: 30000,
  },
  anthropic: {
    failureThreshold: 5,
    successThreshold: 3,
    timeoutMs: 60000,
    resetTimeoutMs: 60000,
  },
  outlook: {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 30000,
    resetTimeoutMs: 30000,
  },
} as const;
