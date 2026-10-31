// Retry loop for Vertex capacity. See docs/content-safety-plan.md.

import { ZodError } from 'zod';

// Capacity, deadlines, malformed model output merit a retry; bad input does not.
const RETRYABLE =
  /429|RESOURCE_EXHAUSTED|\b50[0234]\b|INTERNAL|UNAVAILABLE|abort|timed? ?out|deadline|ECONNRESET|ETIMEDOUT/i;

// A spent balance does not recover inside this budget. A short 429 still does.
const BILLING_EXHAUSTED =
  /no credits remaining|insufficient[_\s-]?quota|billing_hard_limit|exceeded your current quota/i;

export function isBillingExhausted(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  return BILLING_EXHAUSTED.test(`${name} ${message}`);
}

export function isRetryableVertexError(err: unknown): boolean {
  // Unparseable or off-schema JSON is one bad sample: draw again.
  if (err instanceof SyntaxError || err instanceof ZodError) return true;
  // SDK ApiError carries the HTTP code; 5xx is Vertex's fault.
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  return RETRYABLE.test(`${name} ${message}`);
}

// A slow primary is usually slow again a moment later.
function isTimeout(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  return /abort|timed? ?out|deadline/i.test(`${name} ${message}`);
}

export interface ResilientCallOptions<T> {
  // Model (undefined = primary) and the budget left.
  attempt: (model: string | undefined, timeoutMs: number) => Promise<T>;
  // Wall clock for all attempts together.
  timeoutMs: number;
  // Between failure and retry; someone is waiting.
  retryDelayMs?: number;
  // Peer-or-better stand-in, tried last. Omit for none.
  fallbackModel?: string;
  now?: () => number;
  sleepImpl?: (ms: number) => Promise<void>;
  // Per attempt, so callers can count billed calls.
  onAttempt?: (model: string | undefined) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Three tries in one budget: primary, retry, fallback. Throws the last error.
export async function callWithVertexResilience<T>(options: ResilientCallOptions<T>): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleepImpl ?? defaultSleep;
  const retryDelayMs = options.retryDelayMs ?? 250;
  const deadline = now() + options.timeoutMs;
  // Split so every attempt gets a turn; two without a stand-in.
  const shares = options.fallbackModel ? [0.45, 0.2, 0.35] : [0.6, 0.4, 0];
  let lastError: unknown = new Error('no attempt was made');

  let skipRetry = false;

  for (const [index, model] of [undefined, undefined, options.fallbackModel].entries()) {
    if (index === 2 && !options.fallbackModel) break;
    if (index === 1 && skipRetry) continue;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    if (index > 0) await sleep(Math.min(retryDelayMs, Math.max(0, remaining)));

    // Again after sleeping: the wait itself can spend what was left.
    const left = deadline - now();
    if (left <= 0) break;

    // A share, not the remainder: a stalling first attempt must leave room.
    const share = index === 2 ? left : Math.floor(options.timeoutMs * shares[index]!);
    const budget = Math.max(1, Math.min(left, share)); // The stand-in, last, gets the rest.

    try {
      options.onAttempt?.(model);
      return await options.attempt(model, budget);
    } catch (err) {
      lastError = err;
      // Same account will refuse again. The other vendor still gets one try.
      if (isBillingExhausted(err)) {
        if (options.fallbackModel && index < 2) {
          skipRetry = true;
          continue;
        }
        break;
      }
      if (!isRetryableVertexError(err)) break;
      // Waiting out a slow primary twice starves the stand-in.
      if (index === 0 && options.fallbackModel && isTimeout(err)) skipRetry = true;
    }
  }

  throw lastError;
}
