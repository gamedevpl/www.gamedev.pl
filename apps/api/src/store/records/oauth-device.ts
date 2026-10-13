import type { OAuthAccessTokenRecord, OAuthGrantRecord } from './oauth.js';

export interface OAuthDeviceAuthorization {
  userCode: string;
  deviceCodeHash: string;
  clientId: string;
  scope: string;
  deviceName: string;
  expiresAtMs: number;
  intervalSec: number;
  lastPollAt?: number;
  ownerUid?: string;
  viaTokenId?: string;
  viaTokenExpiresAt?: string;
  denied?: boolean;
}

export type DeviceAuthorizationDecision =
  { denied: true } | { ownerUid: string; viaTokenId?: string; viaTokenExpiresAt?: string };

export type DeviceAuthorizationPoll =
  | { ok: true; authorization: OAuthDeviceAuthorization }
  | { ok: false; error: 'invalid_grant' | 'expired_token' | 'slow_down' | 'authorization_pending' | 'access_denied' };

export interface DeviceTokenIssuanceInput {
  deviceCodeHash: string;
  grant: OAuthGrantRecord;
  accessToken: OAuthAccessTokenRecord;
  maxPerOwner: number;
  nowMs: number;
}

export type DeviceTokenIssuanceResult =
  { ok: true } | { ok: false; error: 'invalid_grant' | 'expired_token' | 'access_denied' };

export function deviceTokenIssuanceError(
  row: OAuthDeviceAuthorization | undefined,
  input: DeviceTokenIssuanceInput,
): DeviceTokenIssuanceResult | undefined {
  if (!row || row.deviceCodeHash !== input.deviceCodeHash || row.clientId !== input.grant.clientId)
    return { ok: false, error: 'invalid_grant' };
  if (row.expiresAtMs <= input.nowMs) return { ok: false, error: 'expired_token' };
  if (
    row.denied ||
    !row.ownerUid ||
    row.ownerUid !== input.grant.ownerUid ||
    row.scope !== input.grant.scope ||
    row.viaTokenId !== input.grant.viaTokenId
  )
    return { ok: false, error: 'access_denied' };
}

// A new device sign-in replaces the same device's earlier CLI grant instead of counting against the cap.
export function replacedByDeviceGrant(held: OAuthGrantRecord, grant: OAuthGrantRecord): boolean {
  return (
    !held.revokedAt &&
    held.ownerUid === grant.ownerUid &&
    held.clientId === grant.clientId &&
    (held.deviceName ?? 'this device') === (grant.deviceName ?? 'this device') &&
    held.viaTokenId === grant.viaTokenId
  );
}

export function deviceAuthorizationPoll(row: OAuthDeviceAuthorization, nowMs: number): DeviceAuthorizationPoll {
  if (row.expiresAtMs <= nowMs) return { ok: false, error: 'expired_token' };
  if (row.lastPollAt !== undefined && nowMs - row.lastPollAt < row.intervalSec * 1000) {
    row.intervalSec += 5;
    return { ok: false, error: 'slow_down' };
  }
  row.lastPollAt = nowMs;
  if (row.denied) return { ok: false, error: 'access_denied' };
  if (!row.ownerUid) return { ok: false, error: 'authorization_pending' };
  return { ok: true, authorization: { ...row } };
}

export const validDeviceUserCode = (code: string): boolean =>
  /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(code);
