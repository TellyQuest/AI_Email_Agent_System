import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  andThenAsync,
  tryCatch,
  tryCatchAsync,
  collect,
  type Result,
} from './result.js';

describe('Result type', () => {
  describe('constructors', () => {
    it('ok() creates an Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('err() creates an Err result', () => {
      const result = err('error message');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('error message');
    });
  });

  describe('type guards', () => {
    it('isOk() returns true for Ok results', () => {
      const result = ok('success');
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('isErr() returns true for Err results', () => {
      const result = err(new Error('failed'));
      expect(isErr(result)).toBe(true);
      expect(isOk(result)).toBe(false);
    });
  });

  describe('unwrap', () => {
    it('unwrap() returns value for Ok result', () => {
      const result = ok('hello');
      expect(unwrap(result)).toBe('hello');
    });

    it('unwrap() throws for Err result', () => {
      const result = err('error');
      expect(() => unwrap(result)).toThrow('Tried to unwrap an Err');
    });
  });

  describe('unwrapOr', () => {
    it('returns value for Ok result', () => {
      const result = ok(10);
      expect(unwrapOr(result, 0)).toBe(10);
    });

    it('returns default for Err result', () => {
      const result: Result<number, string> = err('error');
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('map', () => {
    it('transforms value for Ok result', () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);
      expect(isOk(mapped) && mapped.value).toBe(10);
    });

    it('passes through Err result', () => {
      const result: Result<number, string> = err('error');
      const mapped = map(result, (x) => x * 2);
      expect(isErr(mapped) && mapped.error).toBe('error');
    });
  });

  describe('mapErr', () => {
    it('passes through Ok result', () => {
      const result = ok(5);
      const mapped = mapErr(result, (e) => `wrapped: ${e}`);
      expect(isOk(mapped) && mapped.value).toBe(5);
    });

    it('transforms error for Err result', () => {
      const result: Result<number, string> = err('original');
      const mapped = mapErr(result, (e) => `wrapped: ${e}`);
      expect(isErr(mapped) && mapped.error).toBe('wrapped: original');
    });
  });

  describe('andThen', () => {
    it('chains successful operations', () => {
      const result = ok(5);
      const chained = andThen(result, (x) => ok(x * 2));
      expect(isOk(chained) && chained.value).toBe(10);
    });

    it('short-circuits on Err', () => {
      const result: Result<number, string> = err('first error');
      const chained = andThen(result, (x) => ok(x * 2));
      expect(isErr(chained) && chained.error).toBe('first error');
    });

    it('propagates error from chained function', () => {
      const result = ok(5);
      const chained = andThen(result, () => err('chain failed'));
      expect(isErr(chained) && chained.error).toBe('chain failed');
    });
  });

  describe('andThenAsync', () => {
    it('chains async operations successfully', async () => {
      const result = ok(5);
      const chained = await andThenAsync(result, async (x) => ok(x * 2));
      expect(isOk(chained) && chained.value).toBe(10);
    });

    it('short-circuits on Err', async () => {
      const result: Result<number, string> = err('error');
      const chained = await andThenAsync(result, async (x) => ok(x * 2));
      expect(isErr(chained) && chained.error).toBe('error');
    });
  });

  describe('tryCatch', () => {
    it('returns Ok for successful function', () => {
      const result = tryCatch(() => 42);
      expect(isOk(result) && result.value).toBe(42);
    });

    it('returns Err for throwing function', () => {
      const result = tryCatch(() => {
        throw new Error('oops');
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect((result.error as Error).message).toBe('oops');
      }
    });

    it('uses custom error mapper', () => {
      const result = tryCatch(
        () => {
          throw new Error('original');
        },
        (e) => `mapped: ${(e as Error).message}`
      );
      expect(isErr(result) && result.error).toBe('mapped: original');
    });
  });

  describe('tryCatchAsync', () => {
    it('returns Ok for successful async function', async () => {
      const result = await tryCatchAsync(async () => 'success');
      expect(isOk(result) && result.value).toBe('success');
    });

    it('returns Err for rejecting async function', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('async error');
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect((result.error as Error).message).toBe('async error');
      }
    });
  });

  describe('collect', () => {
    it('collects all Ok results into array', () => {
      const results = [ok(1), ok(2), ok(3)];
      const collected = collect(results);
      expect(isOk(collected) && collected.value).toEqual([1, 2, 3]);
    });

    it('returns first Err encountered', () => {
      const results: Result<number, string>[] = [ok(1), err('failed'), ok(3)];
      const collected = collect(results);
      expect(isErr(collected) && collected.error).toBe('failed');
    });

    it('handles empty array', () => {
      const results: Result<number, string>[] = [];
      const collected = collect(results);
      expect(isOk(collected) && collected.value).toEqual([]);
    });
  });
});
