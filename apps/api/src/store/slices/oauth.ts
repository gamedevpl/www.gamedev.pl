import type { Firestore } from '@google-cloud/firestore';
import { stripUndefined } from '../firestore-util.js';
import type {
  OAuthAccessTokenRecord,
  OAuthAuthCodeRecord,
  OAuthClientRecord,
  OAuthGrantRecord,
  RotateRefreshTokenResult,
} from '../records/oauth.js';

export interface OAuthStore {
  // Persists a dynamically registered or CIMD-cached OAuth client.
  createOAuthClient(record: OAuthClientRecord): Promise<void>;

  getOAuthClient(clientId: string): Promise<OAuthClientRecord | null>;

  createOAuthGrant(record: OAuthGrantRecord, opts?: { maxPerOwner?: number }): Promise<boolean>;

  getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null>;

  getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null>;

  listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]>;

  revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean>;

  createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void>;

  getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null>;

  deleteOAuthAccessToken(tokenId: string): Promise<boolean>;

  createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void>;

  // Single-use; deletes used/expired codes. Wrong-hash presentations stay untouched.
  consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null>;

  // Rotating a stale refresh id revokes the whole grant (reuse detection).
  rotateOAuthRefreshToken(input: {
    refreshTokenId: string;
    refreshSecretHash: string;
    newRefreshTokenId: string;
    newRefreshHash: string;
    newRefreshExpiresAt: string;
    newAccessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<RotateRefreshTokenResult>;

  // First token issue after authorization_code exchange (no refresh yet).
  issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null>;
}

export class InMemoryOAuthStore implements OAuthStore {
  // Not private -- deleteAccountIdentity reaches across these (documented exception, see PR).
  oauthClients = new Map<string, OAuthClientRecord>();
  oauthGrants = new Map<string, OAuthGrantRecord>();
  oauthAccessTokens = new Map<string, OAuthAccessTokenRecord>();
  oauthAuthCodes = new Map<string, OAuthAuthCodeRecord>();
  // refresh token id -> grant id, for reuse detection after rotation.
  oauthRefreshTokenIndex = new Map<string, string>();

  async createOAuthClient(record: OAuthClientRecord): Promise<void> {
    this.oauthClients.set(record.clientId, { ...record });
  }

  async getOAuthClient(clientId: string): Promise<OAuthClientRecord | null> {
    const record = this.oauthClients.get(clientId);
    return record ? { ...record } : null;
  }

  async createOAuthGrant(record: OAuthGrantRecord, opts?: { maxPerOwner?: number }): Promise<boolean> {
    if (opts?.maxPerOwner !== undefined) {
      const held = [...this.oauthGrants.values()].filter((g) => g.ownerUid === record.ownerUid && !g.revokedAt);
      if (held.length >= opts.maxPerOwner) return false;
    }
    this.oauthGrants.set(record.grantId, { ...record });
    if (record.currentRefreshTokenId) {
      this.oauthRefreshTokenIndex.set(record.currentRefreshTokenId, record.grantId);
    }
    return true;
  }

  async getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    const record = this.oauthGrants.get(grantId);
    return record ? { ...record } : null;
  }

  async getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null> {
    const grantId = this.oauthRefreshTokenIndex.get(refreshTokenId);
    if (!grantId) return null;
    return this.getOAuthGrant(grantId);
  }

  async listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]> {
    return Array.from(this.oauthGrants.values())
      .filter((grant) => grant.ownerUid === ownerUid && !grant.revokedAt)
      .map((grant) => ({ ...grant }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean> {
    const grant = this.oauthGrants.get(grantId);
    if (!grant || grant.ownerUid !== ownerUid) return false;
    const at = new Date().toISOString();
    this.oauthGrants.set(grantId, { ...grant, revokedAt: at });
    return true;
  }

  async createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void> {
    this.oauthAccessTokens.set(record.tokenId, { ...record });
  }

  async getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null> {
    const record = this.oauthAccessTokens.get(tokenId);
    return record ? { ...record } : null;
  }

  async deleteOAuthAccessToken(tokenId: string): Promise<boolean> {
    return this.oauthAccessTokens.delete(tokenId);
  }

  async createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void> {
    this.oauthAuthCodes.set(record.codeId, { ...record });
  }

  async consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null> {
    const record = this.oauthAuthCodes.get(codeId);
    if (!record) return null;
    if (record.usedAt) {
      this.oauthAuthCodes.delete(codeId);
      return null;
    }
    if (Date.parse(record.expiresAt) <= nowMs) {
      this.oauthAuthCodes.delete(codeId);
      return null;
    }
    if (record.codeHash !== codeHash) return null;
    const used: OAuthAuthCodeRecord = { ...record, usedAt: new Date(nowMs).toISOString() };
    this.oauthAuthCodes.delete(codeId);
    return used;
  }

  async rotateOAuthRefreshToken(input: {
    refreshTokenId: string;
    refreshSecretHash: string;
    newRefreshTokenId: string;
    newRefreshHash: string;
    newRefreshExpiresAt: string;
    newAccessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<RotateRefreshTokenResult> {
    const grantId = this.oauthRefreshTokenIndex.get(input.refreshTokenId);
    if (!grantId) return { ok: false, reason: 'invalid' };
    const grant = this.oauthGrants.get(grantId);
    if (!grant) return { ok: false, reason: 'invalid' };
    if (grant.revokedAt) return { ok: false, reason: 'revoked' };
    if (Date.parse(grant.refreshExpiresAt) <= input.nowMs) return { ok: false, reason: 'expired' };
    if (grant.currentRefreshTokenId !== input.refreshTokenId) {
      this.oauthGrants.set(grantId, { ...grant, revokedAt: new Date(input.nowMs).toISOString() });
      return { ok: false, reason: 'reuse' };
    }
    if (grant.currentRefreshHash !== input.refreshSecretHash) return { ok: false, reason: 'invalid' };

    const previousRefreshTokenId = grant.currentRefreshTokenId;
    const updated: OAuthGrantRecord = {
      ...grant,
      currentRefreshTokenId: input.newRefreshTokenId,
      currentRefreshHash: input.newRefreshHash,
      refreshExpiresAt: input.newRefreshExpiresAt,
      lastUsedAt: new Date(input.nowMs).toISOString(),
    };
    this.oauthGrants.set(grantId, updated);
    this.oauthRefreshTokenIndex.set(input.newRefreshTokenId, grantId);
    this.oauthAccessTokens.set(input.newAccessToken.tokenId, { ...input.newAccessToken });
    return { ok: true, grant: { ...updated }, previousRefreshTokenId };
  }

  async issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null> {
    const grant = this.oauthGrants.get(input.grantId);
    if (!grant || grant.revokedAt) return null;
    if (grant.currentRefreshTokenId) return null;

    const updated: OAuthGrantRecord = {
      ...grant,
      currentRefreshTokenId: input.refreshTokenId,
      currentRefreshHash: input.refreshHash,
      refreshExpiresAt: input.refreshExpiresAt,
      lastUsedAt: new Date(input.nowMs).toISOString(),
    };
    this.oauthGrants.set(input.grantId, updated);
    this.oauthRefreshTokenIndex.set(input.refreshTokenId, input.grantId);
    this.oauthAccessTokens.set(input.accessToken.tokenId, { ...input.accessToken });
    return { ...updated };
  }
}

export class FirestoreOAuthStore implements OAuthStore {
  constructor(private db: Firestore) {}

  async createOAuthClient(record: OAuthClientRecord): Promise<void> {
    await this.db.collection('oauthClients').doc(record.clientId).create(stripUndefined(record));
  }

  async getOAuthClient(clientId: string): Promise<OAuthClientRecord | null> {
    const snap = await this.db.collection('oauthClients').doc(clientId).get();
    if (!snap.exists) return null;
    return snap.data() as OAuthClientRecord;
  }

  async createOAuthGrant(record: OAuthGrantRecord, opts?: { maxPerOwner?: number }): Promise<boolean> {
    if (opts?.maxPerOwner === undefined) {
      const batch = this.db.batch();
      batch.create(this.db.collection('oauthGrants').doc(record.grantId), stripUndefined(record));
      if (record.currentRefreshTokenId) {
        batch.set(this.db.collection('oauthRefreshTokens').doc(record.currentRefreshTokenId), {
          grantId: record.grantId,
        });
      }
      await batch.commit();
      return true;
    }
    const max = opts.maxPerOwner;
    const grants = this.db.collection('oauthGrants');
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(grants.where('ownerUid', '==', record.ownerUid));
      const held = snap.docs.map((doc) => doc.data() as OAuthGrantRecord).filter((grant) => !grant.revokedAt);
      if (held.length >= max) return false;
      tx.create(grants.doc(record.grantId), stripUndefined(record));
      if (record.currentRefreshTokenId) {
        tx.set(this.db.collection('oauthRefreshTokens').doc(record.currentRefreshTokenId), {
          grantId: record.grantId,
        });
      }
      return true;
    });
  }

  async getOAuthGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    const snap = await this.db.collection('oauthGrants').doc(grantId).get();
    if (!snap.exists) return null;
    return snap.data() as OAuthGrantRecord;
  }

  async getOAuthGrantByRefreshTokenId(refreshTokenId: string): Promise<OAuthGrantRecord | null> {
    const indexSnap = await this.db.collection('oauthRefreshTokens').doc(refreshTokenId).get();
    if (!indexSnap.exists) return null;
    const grantId = (indexSnap.data() as { grantId: string }).grantId;
    return this.getOAuthGrant(grantId);
  }

  async listOAuthGrantsByOwner(ownerUid: string): Promise<OAuthGrantRecord[]> {
    const snap = await this.db.collection('oauthGrants').where('ownerUid', '==', ownerUid).get();
    return snap.docs
      .map((doc) => doc.data() as OAuthGrantRecord)
      .filter((grant) => !grant.revokedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeOAuthGrant(grantId: string, ownerUid: string): Promise<boolean> {
    const docRef = this.db.collection('oauthGrants').doc(grantId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return false;
      const grant = snap.data() as OAuthGrantRecord;
      if (grant.ownerUid !== ownerUid) return false;
      tx.update(docRef, { revokedAt: new Date().toISOString() });
      return true;
    });
  }

  async createOAuthAccessToken(record: OAuthAccessTokenRecord): Promise<void> {
    await this.db.collection('oauthAccessTokens').doc(record.tokenId).create(stripUndefined(record));
  }

  async getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenRecord | null> {
    const snap = await this.db.collection('oauthAccessTokens').doc(tokenId).get();
    if (!snap.exists) return null;
    return snap.data() as OAuthAccessTokenRecord;
  }

  async deleteOAuthAccessToken(tokenId: string): Promise<boolean> {
    const docRef = this.db.collection('oauthAccessTokens').doc(tokenId);
    const snap = await docRef.get();
    if (!snap.exists) return false;
    await docRef.delete();
    return true;
  }

  async createOAuthAuthCode(record: OAuthAuthCodeRecord): Promise<void> {
    await this.db.collection('oauthAuthCodes').doc(record.codeId).create(stripUndefined(record));
  }

  async consumeOAuthAuthCode(codeId: string, codeHash: string, nowMs: number): Promise<OAuthAuthCodeRecord | null> {
    const docRef = this.db.collection('oauthAuthCodes').doc(codeId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return null;
      const record = snap.data() as OAuthAuthCodeRecord;
      if (record.usedAt) {
        tx.delete(docRef);
        return null;
      }
      if (Date.parse(record.expiresAt) <= nowMs) {
        tx.delete(docRef);
        return null;
      }
      if (record.codeHash !== codeHash) return null;
      const usedAt = new Date(nowMs).toISOString();
      tx.delete(docRef);
      return { ...record, usedAt };
    });
  }

  async rotateOAuthRefreshToken(input: {
    refreshTokenId: string;
    refreshSecretHash: string;
    newRefreshTokenId: string;
    newRefreshHash: string;
    newRefreshExpiresAt: string;
    newAccessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<RotateRefreshTokenResult> {
    const grantIdFromIndex = await this.getOAuthGrantByRefreshTokenId(input.refreshTokenId);
    if (!grantIdFromIndex) return { ok: false, reason: 'invalid' };

    const grantRef = this.db.collection('oauthGrants').doc(grantIdFromIndex.grantId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(grantRef);
      if (!snap.exists) return { ok: false, reason: 'invalid' as const };
      const grant = snap.data() as OAuthGrantRecord;
      if (grant.revokedAt) return { ok: false, reason: 'revoked' as const };
      if (Date.parse(grant.refreshExpiresAt) <= input.nowMs) return { ok: false, reason: 'expired' as const };
      if (grant.currentRefreshTokenId !== input.refreshTokenId) {
        tx.update(grantRef, { revokedAt: new Date(input.nowMs).toISOString() });
        return { ok: false, reason: 'reuse' as const };
      }
      if (grant.currentRefreshHash !== input.refreshSecretHash) return { ok: false, reason: 'invalid' as const };

      const previousRefreshTokenId = grant.currentRefreshTokenId;
      const updated: OAuthGrantRecord = {
        ...grant,
        currentRefreshTokenId: input.newRefreshTokenId,
        currentRefreshHash: input.newRefreshHash,
        refreshExpiresAt: input.newRefreshExpiresAt,
        lastUsedAt: new Date(input.nowMs).toISOString(),
      };
      tx.set(grantRef, updated);
      tx.set(this.db.collection('oauthRefreshTokens').doc(input.newRefreshTokenId), {
        grantId: grant.grantId,
      });
      tx.create(
        this.db.collection('oauthAccessTokens').doc(input.newAccessToken.tokenId),
        stripUndefined(input.newAccessToken),
      );
      return { ok: true, grant: updated, previousRefreshTokenId };
    });
  }

  async issueOAuthTokensFromGrant(input: {
    grantId: string;
    refreshTokenId: string;
    refreshHash: string;
    refreshExpiresAt: string;
    accessToken: OAuthAccessTokenRecord;
    nowMs: number;
  }): Promise<OAuthGrantRecord | null> {
    const grantRef = this.db.collection('oauthGrants').doc(input.grantId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(grantRef);
      if (!snap.exists) return null;
      const grant = snap.data() as OAuthGrantRecord;
      if (grant.revokedAt) return null;
      if (grant.currentRefreshTokenId) return null;

      const updated: OAuthGrantRecord = {
        ...grant,
        currentRefreshTokenId: input.refreshTokenId,
        currentRefreshHash: input.refreshHash,
        refreshExpiresAt: input.refreshExpiresAt,
        lastUsedAt: new Date(input.nowMs).toISOString(),
      };
      tx.set(grantRef, updated);
      tx.set(this.db.collection('oauthRefreshTokens').doc(input.refreshTokenId), {
        grantId: input.grantId,
      });
      tx.create(
        this.db.collection('oauthAccessTokens').doc(input.accessToken.tokenId),
        stripUndefined(input.accessToken),
      );
      return updated;
    });
  }
}
