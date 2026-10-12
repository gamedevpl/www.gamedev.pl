import type { Firestore } from '@google-cloud/firestore';
import { isAccessTokenExpired } from '../../platform/access-token.js';
import { stripUndefined } from '../firestore-util.js';
import type { AccessTokenRecord } from '../records/access-tokens.js';
import type { User } from '../records/identity.js';
import type { OAuthAccessTokenRecord, OAuthGrantRecord } from '../records/oauth.js';
import {
  deviceTokenIssuanceError,
  type DeviceTokenIssuanceInput,
  type DeviceTokenIssuanceResult,
  type OAuthDeviceAuthorization,
} from '../records/oauth-device.js';

export function completeMemoryDeviceTokens(
  state: {
    authorizations: Map<string, OAuthDeviceAuthorization>;
    codes: Map<string, string>;
    grants: Map<string, OAuthGrantRecord>;
    accessTokens: Map<string, OAuthAccessTokenRecord>;
    refreshIndex: Map<string, string>;
  },
  input: DeviceTokenIssuanceInput,
): DeviceTokenIssuanceResult {
  const code = state.codes.get(input.deviceCodeHash);
  const row = code ? state.authorizations.get(code) : undefined;
  const error = deviceTokenIssuanceError(row, input);
  if (error) return error;
  const held = [...state.grants.values()].filter(
    (grant) => grant.ownerUid === input.grant.ownerUid && !grant.revokedAt,
  );
  if (held.length >= input.maxPerOwner) return { ok: false, error: 'access_denied' };
  state.grants.set(input.grant.grantId, { ...input.grant });
  state.accessTokens.set(input.accessToken.tokenId, { ...input.accessToken });
  state.refreshIndex.set(input.grant.currentRefreshTokenId, input.grant.grantId);
  state.authorizations.delete(row!.userCode);
  state.codes.delete(input.deviceCodeHash);
  return { ok: true };
}

export async function completeFirestoreDeviceTokens(
  db: Firestore,
  input: DeviceTokenIssuanceInput,
): Promise<DeviceTokenIssuanceResult> {
  const codeRef = db.collection('oauthDeviceCodes').doc(input.deviceCodeHash);
  return db.runTransaction(async (tx) => {
    const code = await tx.get(codeRef);
    if (!code.exists) return { ok: false, error: 'invalid_grant' };
    const rowRef = db.collection('oauthDeviceAuthorizations').doc((code.data() as { userCode: string }).userCode);
    const snap = await tx.get(rowRef);
    const row = snap.exists ? (snap.data() as OAuthDeviceAuthorization) : undefined;
    const error = deviceTokenIssuanceError(row, input);
    if (error) return error;
    const user = await tx.get(db.collection('users').doc(input.grant.ownerUid));
    const owner = user.exists ? (user.data() as User) : undefined;
    if (!owner || owner.tier === 'blocked' || owner.deletionScheduledFor) return { ok: false, error: 'access_denied' };
    if (row!.viaTokenId) {
      const snap = await tx.get(db.collection('accessTokens').doc(row!.viaTokenId));
      const token = snap.exists ? (snap.data() as AccessTokenRecord) : undefined;
      if (!token || token.uid !== row!.ownerUid || isAccessTokenExpired(token.expiresAt, input.nowMs))
        return { ok: false, error: 'access_denied' };
    }
    const grants = db.collection('oauthGrants');
    const held = await tx.get(grants.where('ownerUid', '==', input.grant.ownerUid));
    if (held.docs.filter((doc) => !(doc.data() as OAuthGrantRecord).revokedAt).length >= input.maxPerOwner)
      return { ok: false, error: 'access_denied' };
    tx.create(grants.doc(input.grant.grantId), stripUndefined(input.grant));
    tx.create(db.collection('oauthRefreshTokens').doc(input.grant.currentRefreshTokenId), {
      grantId: input.grant.grantId,
    });
    tx.create(db.collection('oauthAccessTokens').doc(input.accessToken.tokenId), stripUndefined(input.accessToken));
    tx.delete(rowRef);
    tx.delete(codeRef);
    return { ok: true };
  });
}
