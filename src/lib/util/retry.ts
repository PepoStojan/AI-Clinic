// Generic exponential-backoff retry, shared by every provider adapter.
// Locked policy (Build Spec section 8): max 2 automatic retries for
// recoverable failures only (timeout, 429, 5xx, transient network error).

export interface RetryOptions {
  /** Additional attempts after the first. Default 2 (= 3 total attempts). */
  maxRetries?: number;
  isRecoverable: (error: unknown) => boolean;
  baseDelayMs?: number;
}

export interface RetryResult<T> {
  value: T;
  attempts: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !options.isRecoverable(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }

  throw lastError;
}
