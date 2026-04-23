/**
 * Generic exponential-backoff retry helper for external API calls.
 *
 * Used by scripts/eval.ts and anywhere else that touches external APIs
 * (Anthropic, Voyage, Cohere, Supabase, the local chat API). Handles
 * transient network errors, rate limits, 5xx responses, and Anthropic
 * "overloaded" errors by default.
 *
 * Existing retry logic in src/lib/voyage.ts is a specialized version of
 * this pattern. New call sites should prefer `withRetry()`.
 */

export interface RetryOptions {
  /** Max attempts including the first call. Default: 4. */
  maxAttempts?: number;
  /** Initial delay in ms. Doubled each retry until maxDelayMs. Default: 1000. */
  initialDelayMs?: number;
  /** Cap on backoff delay. Default: 30000 (30s). */
  maxDelayMs?: number;
  /** Decide whether a given error is retryable. Default: transient/network/5xx/429/overloaded. */
  shouldRetry?: (err: unknown) => boolean;
  /** Called before each retry. Useful for logging. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** Label for debug logs. */
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const initialDelay = opts.initialDelayMs ?? 1000;
  const maxDelay = opts.maxDelayMs ?? 30000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt >= maxAttempts - 1;
      if (isLast || !shouldRetry(err)) throw err;
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      if (opts.onRetry) {
        opts.onRetry(err, attempt + 1, delay);
      } else {
        const label = opts.label ?? "withRetry";
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[${label}] attempt ${attempt + 1} failed (${msg}), retrying in ${delay}ms...`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function defaultShouldRetry(err: unknown): boolean {
  // Fetch network errors throw TypeError
  if (err instanceof TypeError) return true;

  const msg = err instanceof Error ? err.message : String(err);

  // Rate limits, server errors, timeouts, Anthropic overloaded
  if (/429|rate[\s_-]?limit/i.test(msg)) return true;
  if (/\b5\d\d\b/.test(msg)) return true;
  if (/timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/i.test(msg)) return true;
  if (/overloaded/i.test(msg)) return true;

  return false;
}
