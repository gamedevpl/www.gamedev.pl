import { resolveAccessTokenUser } from './access-token-service.js';
import { readBearerToken } from './bearer.js';
import { CREATOR_SCOPE, scopeIncludes } from './oauth-scopes.js';
import { looksLikeAsAccessToken, verifyAsAccessToken } from './oauth-tokens.js';
import type { Store, User } from './store.js';

export type BearerIdentity = {
  user: User;
  method: 'token' | 'oauth';
  scope?: string;
};

export async function resolveBearerIdentity(
  store: Store,
  authorization: string | undefined,
  nowMs: number = Date.now(),
): Promise<BearerIdentity | null> {
  const bearer = readBearerToken(authorization);
  if (!bearer) return null;

  const patUser = await resolveAccessTokenUser(store, bearer, nowMs);
  if (patUser) return { user: patUser, method: 'token' };

  if (!looksLikeAsAccessToken(bearer)) return null;
  const access = await verifyAsAccessToken(store, bearer, nowMs);
  if (!access || !scopeIncludes(access.scope, CREATOR_SCOPE)) return null;
  const user = await store.getUser(access.ownerUid);
  if (!user) return null;
  return { user, method: 'oauth', scope: access.scope };
}
