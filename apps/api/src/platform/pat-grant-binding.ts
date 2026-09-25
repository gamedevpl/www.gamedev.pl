import type { FastifyRequest } from 'fastify';
import { isAccessTokenExpired } from './access-token.js';
import type { Store } from './store.js';

export interface ConsentIdentity {
  uid: string;
  viaTokenId?: string;
  viaTokenExpiresAt?: string;
}

export interface TokenBinding {
  ownerUid: string;
  viaTokenId?: string;
}

export async function consentIdentity(
  request: FastifyRequest,
  store: Store,
  nowMs: number,
): Promise<ConsentIdentity | null> {
  const user = request.user;
  if (!user || user.tier === 'blocked') return null;
  if (request.authMethod === 'session') return { uid: user.uid };
  const tokenId = request.sessionTokenId;
  if (request.authMethod !== 'token' || !tokenId) return null;
  const record = await store.getAccessToken(tokenId);
  if (!record || record.uid !== user.uid || isAccessTokenExpired(record.expiresAt, nowMs)) return null;
  return { uid: user.uid, viaTokenId: tokenId, viaTokenExpiresAt: record.expiresAt };
}

type BindingFields = { viaTokenId?: string; viaTokenExpiresAt?: string };

export function bindingFields(source: BindingFields): BindingFields {
  if (!source.viaTokenId) return {};
  return { viaTokenId: source.viaTokenId, viaTokenExpiresAt: source.viaTokenExpiresAt };
}

export async function tokenBindingLive(store: Store, binding: TokenBinding, nowMs: number): Promise<boolean> {
  if (!binding.viaTokenId) return true;
  const record = await store.getAccessToken(binding.viaTokenId);
  if (!record || record.uid !== binding.ownerUid) return false;
  if (isAccessTokenExpired(record.expiresAt, nowMs)) return false;
  const user = await store.getUser(binding.ownerUid);
  return Boolean(user && user.tier !== 'blocked' && !user.deletionScheduledFor);
}

export async function revokeAccessTokenAndGrants(store: Store, tokenId: string): Promise<boolean> {
  const record = await store.getAccessToken(tokenId);
  const deleted = await store.deleteAccessToken(tokenId);
  if (!record) return deleted;
  const grants = await store.listOAuthGrantsByOwner(record.uid);
  for (const grant of grants) {
    if (grant.viaTokenId === tokenId) await store.revokeOAuthGrant(grant.grantId, record.uid);
  }
  return deleted;
}
