import type { Store } from '../platform/store.js';
import { peekQuota } from '../platform/quota-peek.js';

// Free read before the classifier: a loop buys no refusals.
export async function quotaHeadroom(
  store: Store,
  uid: string,
  dateStr: string,
  limit: number,
  action: 'improvements' | 'feedback',
  exhausted: string,
): Promise<string | null> {
  const headroom = await peekQuota(store, uid, dateStr, limit, action);
  if (headroom.allowed) return null;
  return headroom.tier === 'blocked' ? 'account is blocked' : exhausted;
}
