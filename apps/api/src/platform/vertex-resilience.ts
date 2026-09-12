// Retry loop for Vertex capacity. See docs/content-safety-plan.md.

// Capacity and deadlines merit a retry; bad input does not.
const RETRYABLE = /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|abort|timed? ?out|deadline|ECONNRESET|ETIMEDOUT/i;

export function isRetryableVertexError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  return RETRYABLE.test(`${name} ${message}`);
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
  let lastError: unknown = new Error('no attempt was made');

  for (const [index, model] of [undefined, undefined, options.fallbackModel].entries()) {
    if (index === 2 && !options.fallbackModel) break;
    const remaining = deadline - now();
    if (remaining <= 0) break;
    if (index > 0) await sleep(Math.min(retryDelayMs, Math.max(0, remaining)));

    // Again after sleeping: the wait itself can spend what was left.
    const budget = deadline - now();
    if (budget <= 0) break;

    try {
      options.onAttempt?.(model);
      return await options.attempt(model, budget);
    } catch (err) {
      lastError = err;
      if (!isRetryableVertexError(err)) break;
    }
  }

  throw lastError;
}
