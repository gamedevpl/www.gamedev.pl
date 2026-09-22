import type { Store } from '../platform/store.js';
import { peekQuota } from '../platform/quota-peek.js';
import type { McpErrorCode } from './mcp-tool-support.js';

export interface QuotaRefusal {
  code: McpErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

const DAY_SECONDS = 24 * 60 * 60;

// Daily quotas reset at UTC midnight: the only honest wait.
export function secondsUntilUtcMidnight(atMs: number): number {
  const elapsed = Math.floor(atMs / 1000) % DAY_SECONDS;
  return DAY_SECONDS - elapsed;
}

// A blocked account never clears by waiting, so no retry.
export function quotaRefusal(tier: string | undefined, exhausted: string, atMs: number): QuotaRefusal {
  if (tier === 'blocked') return { code: 'quota_blocked', message: 'account is blocked' };
  return { code: 'quota_exhausted', message: exhausted, retryAfterSeconds: secondsUntilUtcMidnight(atMs) };
}

// Free read before the classifier: a loop buys no refusals.
export async function quotaHeadroom(
  store: Store,
  uid: string,
  dateStr: string,
  limit: number,
  action: 'improvements' | 'feedback',
  exhausted: string,
  atMs: number = Date.now(),
): Promise<QuotaRefusal | null> {
  const headroom = await peekQuota(store, uid, dateStr, limit, action);
  if (headroom.allowed) return null;
  return quotaRefusal(headroom.tier, exhausted, atMs);
}
