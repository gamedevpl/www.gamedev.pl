export interface SnapshotWriteRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;
const MAX_CAUSE_DEPTH = 3;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function parseRetryAfterMs(header: string | null, nowMs: number): number {
  if (!header) return 0;
  const trimmed = header.trim();
  if (!trimmed) return 0;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const targetMs = Date.parse(trimmed);
  return Number.isFinite(targetMs) ? Math.max(0, targetMs - nowMs) : 0;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function readErrorCode(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('code' in value)) return null;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' && code.trim().length > 0 ? cleanText(code) : null;
}

function readErrorMessage(value: unknown): string | null {
  if (value instanceof Error) return cleanText(value.message) || null;
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === 'string' && message.trim().length > 0 ? cleanText(message) : null;
  }
  return null;
}

// Node fetch throws "fetch failed" with socket details nested under error.cause.
export function describeTransportError(error: unknown): string {
  const base = readErrorMessage(error) ?? cleanText(String(error));
  const details: string[] = [];
  const topCode = readErrorCode(error);
  if (topCode && !base.includes(topCode)) details.push(topCode);

  const seen = new Set<unknown>([error]);
  let cursor: unknown =
    typeof error === 'object' && error !== null && 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cursor !== undefined && cursor !== null; depth += 1) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const code = readErrorCode(cursor);
    const message = readErrorMessage(cursor);
    const part =
      code && message && message !== code
        ? `${code}: ${message}`
        : (code ?? (message && message !== base ? message : null));
    if (part && !details.includes(part)) details.push(part);
    cursor = typeof cursor === 'object' && 'cause' in cursor ? (cursor as { cause?: unknown }).cause : undefined;
  }

  return details.length > 0 ? `${base} (${details.join('; ')})` : base;
}

// Snapshot uploads are idempotent; retry transient GCS and socket failures.
export async function retrySnapshotWrite(
  name: string,
  send: () => Promise<Response>,
  options: SnapshotWriteRetryOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  const backoffDelay = (attempt: number, retryAfterMs = 0): number => {
    const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    const jitter = Math.floor(random() * Math.min(200, baseDelayMs));
    return Math.min(maxDelayMs, Math.max(exp + jitter, retryAfterMs));
  };

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await send();
      if (!isRetryableStatus(response.status) || attempt >= maxRetries) {
        return response;
      }
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), now());
      await response.body?.cancel().catch(() => {});
      await sleep(backoffDelay(attempt, retryAfterMs));
    } catch (error: unknown) {
      if (isAbortError(error) || attempt >= maxRetries) {
        throw new Error(`snapshot write of ${name} failed: ${describeTransportError(error)}`, { cause: error });
      }
      await sleep(backoffDelay(attempt));
    }
  }
}
