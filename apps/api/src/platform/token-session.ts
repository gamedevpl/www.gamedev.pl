import { isAccessTokenExpired } from './access-token.js';
import type { Store } from './store.js';

// Per request, or renewal keeps a revoked PAT's cookie alive forever.
export async function tokenSessionLive(
  store: Store,
  uid: string,
  tokenId: string | undefined,
  nowMs: number,
): Promise<boolean> {
  if (!tokenId) return false; // pre-stamp cookie: nothing to check, fail closed
  const record = await store.getAccessToken(tokenId);
  return Boolean(record && record.uid === uid && !isAccessTokenExpired(record.expiresAt, nowMs));
}
