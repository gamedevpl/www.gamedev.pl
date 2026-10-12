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
