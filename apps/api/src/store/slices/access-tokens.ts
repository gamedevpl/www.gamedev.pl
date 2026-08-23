import type { Firestore } from '@google-cloud/firestore';
import type { AccessTokenRecord } from '../records/access-tokens.js';

export interface AccessTokensStore {
  /** Persist a newly minted personal access token. */
  createAccessToken(record: AccessTokenRecord): Promise<void>;

  /** Point lookup by token id — the hot path on every bearer-authenticated request. */
  getAccessToken(tokenId: string): Promise<AccessTokenRecord | null>;

  /** Every token issued to a user, newest first. Never includes secrets (only hashes). */
  listAccessTokens(uid: string): Promise<AccessTokenRecord[]>;

  /** Revoke by id. Returns false when the token did not exist. */
  deleteAccessToken(tokenId: string): Promise<boolean>;

  /** Best-effort last-use stamp; callers must not let a failure fail the request. */
  touchAccessToken(tokenId: string, at: string): Promise<void>;
}

export class InMemoryAccessTokensStore implements AccessTokensStore {
  // Not private -- deleteAccountIdentity reaches across this (documented exception, see PR).
  accessTokens = new Map<string, AccessTokenRecord>();

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    this.accessTokens.set(record.tokenId, { ...record });
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    const record = this.accessTokens.get(tokenId);
    return record ? { ...record } : null;
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    return Array.from(this.accessTokens.values())
      .filter((record) => record.uid === uid)
      .map((record) => ({ ...record }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    return this.accessTokens.delete(tokenId);
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    const record = this.accessTokens.get(tokenId);
    if (record) this.accessTokens.set(tokenId, { ...record, lastUsedAt: at });
  }
}

export class FirestoreAccessTokensStore implements AccessTokensStore {
  constructor(private db: Firestore) {}

  async createAccessToken(record: AccessTokenRecord): Promise<void> {
    await this.db.collection('accessTokens').doc(record.tokenId).create(record);
  }

  async getAccessToken(tokenId: string): Promise<AccessTokenRecord | null> {
    const snap = await this.db.collection('accessTokens').doc(tokenId).get();
    if (!snap.exists) return null;
    return snap.data() as AccessTokenRecord;
  }

  async listAccessTokens(uid: string): Promise<AccessTokenRecord[]> {
    const snap = await this.db.collection('accessTokens').where('uid', '==', uid).get();
    // Sorted in memory rather than with orderBy: a composite (uid, createdAt) index is
    // not worth provisioning for a listing whose result set is a handful of rows.
    return snap.docs
      .map((doc) => doc.data() as AccessTokenRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAccessToken(tokenId: string): Promise<boolean> {
    const docRef = this.db.collection('accessTokens').doc(tokenId);
    const snap = await docRef.get();
    if (!snap.exists) return false;
    await docRef.delete();
    return true;
  }

  async touchAccessToken(tokenId: string, at: string): Promise<void> {
    // `update` (not merge-set): a revoked token's doc is gone, and merge-set
    // would resurrect a partial record that later auth reads crash on. Missing
    // docs throw; callers already treat touch as best-effort.
    await this.db.collection('accessTokens').doc(tokenId).update({ lastUsedAt: at });
  }
}
