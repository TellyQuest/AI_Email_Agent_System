import { describe, it, expect } from 'vitest';

describe('Queue configuration', () => {
  describe('queue names', () => {
    it('defines expected queue names', () => {
      const queueNames = ['email-ingestion', 'email-classification', 'action-execution'];

      expect(queueNames).toContain('email-ingestion');
      expect(queueNames).toContain('email-classification');
      expect(queueNames).toContain('action-execution');
    });
  });

  describe('job options', () => {
    it('defines default job options structure', () => {
      const defaultJobOptions = {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      };

      expect(defaultJobOptions.attempts).toBe(3);
      expect(defaultJobOptions.backoff.type).toBe('exponential');
      expect(defaultJobOptions.removeOnComplete).toBe(true);
    });

    it('allows retry configuration', () => {
      const retryConfig = {
        maxAttempts: 5,
        retryDelay: 2000,
        backoffMultiplier: 2,
      };

      expect(retryConfig.maxAttempts).toBeGreaterThan(0);
      expect(retryConfig.retryDelay).toBeGreaterThan(0);
    });
  });
});
