/**
 * Result type for explicit error handling
 * Inspired by Rust's Result type
 */

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

// Constructor functions
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

// Type guards
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok;

// Utility functions
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Tried to unwrap an Err: ${JSON.stringify(result.error)}`);
};

export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  return result.ok ? result.value : defaultValue;
};

export const map = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
  return result.ok ? ok(fn(result.value)) : result;
};

export const mapErr = <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> => {
  return result.ok ? result : err(fn(result.error));
};

export const andThen = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> => {
  return result.ok ? fn(result.value) : result;
};

// Async version of andThen
export const andThenAsync = async <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> => {
  return result.ok ? fn(result.value) : result;
};

// Try-catch wrapper that returns Result
export const tryCatch = <T, E = Error>(fn: () => T, mapError?: (e: unknown) => E): Result<T, E> => {
  try {
    return ok(fn());
  } catch (e) {
    const error = mapError ? mapError(e) : (e as E);
    return err(error);
  }
};

// Async try-catch wrapper
export const tryCatchAsync = async <T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (e: unknown) => E
): Promise<Result<T, E>> => {
  try {
    return ok(await fn());
  } catch (e) {
    const error = mapError ? mapError(e) : (e as E);
    return err(error);
  }
};

// Collect array of Results into Result of array
export const collect = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
};
