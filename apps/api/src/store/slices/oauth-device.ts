import type { Firestore } from '@google-cloud/firestore';
import { stripUndefined } from '../firestore-util.js';
import {
  deviceAuthorizationPoll,
  validDeviceUserCode,
  type DeviceAuthorizationDecision,
  type DeviceAuthorizationPoll,
  type OAuthDeviceAuthorization,
} from '../records/oauth-device.js';

export interface OAuthDeviceStore {
  createOAuthDeviceAuthorization(
    row: OAuthDeviceAuthorization,
    nowMs: number,
    maxPending: number,
  ): Promise<'created' | 'collision' | 'full'>;
  getOAuthDeviceAuthorization(userCode: string, nowMs: number): Promise<OAuthDeviceAuthorization | null>;
  decideOAuthDeviceAuthorization(
    userCode: string,
    decision: DeviceAuthorizationDecision,
    nowMs: number,
  ): Promise<boolean>;
  pollOAuthDeviceAuthorization(
    deviceCodeHash: string,
    clientId: string,
    nowMs: number,
  ): Promise<DeviceAuthorizationPoll>;
  eraseOAuthDeviceAuthorizations(ownerUid: string): Promise<void>;
}

export class InMemoryOAuthDeviceStore implements OAuthDeviceStore {
  private authorizations = new Map<string, OAuthDeviceAuthorization>();
  private codes = new Map<string, string>();

  private remove(row: OAuthDeviceAuthorization): void {
    this.authorizations.delete(row.userCode);
    this.codes.delete(row.deviceCodeHash);
  }

  async createOAuthDeviceAuthorization(
    row: OAuthDeviceAuthorization,
    nowMs: number,
    maxPending: number,
  ): Promise<'created' | 'collision' | 'full'> {
    for (const held of this.authorizations.values()) if (held.expiresAtMs <= nowMs) this.remove(held);
    if (this.authorizations.has(row.userCode) || this.codes.has(row.deviceCodeHash)) return 'collision';
    if (this.authorizations.size >= maxPending) return 'full';
    this.authorizations.set(row.userCode, { ...row });
    this.codes.set(row.deviceCodeHash, row.userCode);
    return 'created';
  }

  async getOAuthDeviceAuthorization(userCode: string, nowMs: number): Promise<OAuthDeviceAuthorization | null> {
    const row = this.authorizations.get(userCode);
    return row && row.expiresAtMs > nowMs ? { ...row } : null;
  }

  async decideOAuthDeviceAuthorization(
    userCode: string,
    decision: DeviceAuthorizationDecision,
    nowMs: number,
  ): Promise<boolean> {
    const row = this.authorizations.get(userCode);
    if (!row || row.expiresAtMs <= nowMs || row.ownerUid || row.denied) return false;
    Object.assign(row, decision);
    return true;
  }

  async pollOAuthDeviceAuthorization(
    deviceCodeHash: string,
    clientId: string,
    nowMs: number,
  ): Promise<DeviceAuthorizationPoll> {
    const code = this.codes.get(deviceCodeHash);
    const row = code ? this.authorizations.get(code) : undefined;
    if (!row || row.clientId !== clientId) return { ok: false, error: 'invalid_grant' };
    const result = deviceAuthorizationPoll(row, nowMs);
    if (result.ok || result.error === 'expired_token' || result.error === 'access_denied') this.remove(row);
    return result;
  }

  async eraseOAuthDeviceAuthorizations(ownerUid: string): Promise<void> {
    for (const row of this.authorizations.values()) if (row.ownerUid === ownerUid) this.remove(row);
  }
}

export class FirestoreOAuthDeviceStore implements OAuthDeviceStore {
  constructor(private deviceDb: Firestore) {}

  async createOAuthDeviceAuthorization(
    row: OAuthDeviceAuthorization,
    nowMs: number,
    maxPending: number,
  ): Promise<'created' | 'collision' | 'full'> {
    const rows = this.deviceDb.collection('oauthDeviceAuthorizations');
    const rowRef = rows.doc(row.userCode);
    const codeRef = this.deviceDb.collection('oauthDeviceCodes').doc(row.deviceCodeHash);
    const lock = this.deviceDb.collection('oauthDeviceLimits').doc('active');
    return this.deviceDb.runTransaction(async (tx) => {
      // Serialize capacity checks across instances, including inserts into an empty collection.
      await tx.get(lock);
      const existing = await tx.get(rowRef);
      const code = await tx.get(codeRef);
      const active = await tx.get(rows.where('expiresAtMs', '>', nowMs).limit(maxPending));
      if ((existing.exists && (existing.data() as OAuthDeviceAuthorization).expiresAtMs > nowMs) || code.exists)
        return 'collision';
      if (active.docs.length >= maxPending) return 'full';
      const expiresAt = new Date(row.expiresAtMs);
      if (existing.exists)
        tx.delete(
          this.deviceDb
            .collection('oauthDeviceCodes')
            .doc((existing.data() as OAuthDeviceAuthorization).deviceCodeHash),
        );
      tx.set(rowRef, { ...stripUndefined(row), expiresAt });
      tx.create(codeRef, { userCode: row.userCode, expiresAt });
      tx.set(lock, { lastCreatedHash: row.deviceCodeHash });
      return 'created';
    });
  }

  async getOAuthDeviceAuthorization(userCode: string, nowMs: number): Promise<OAuthDeviceAuthorization | null> {
    if (!validDeviceUserCode(userCode)) return null;
    const snap = await this.deviceDb.collection('oauthDeviceAuthorizations').doc(userCode).get();
    const row = snap.exists ? (snap.data() as OAuthDeviceAuthorization) : null;
    return row && row.expiresAtMs > nowMs ? row : null;
  }

  async decideOAuthDeviceAuthorization(
    userCode: string,
    decision: DeviceAuthorizationDecision,
    nowMs: number,
  ): Promise<boolean> {
    if (!validDeviceUserCode(userCode)) return false;
    const ref = this.deviceDb.collection('oauthDeviceAuthorizations').doc(userCode);
    return this.deviceDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const row = snap.data() as OAuthDeviceAuthorization;
      if (row.expiresAtMs <= nowMs || row.ownerUid || row.denied) return false;
      tx.update(ref, stripUndefined(decision));
      return true;
    });
  }

  async pollOAuthDeviceAuthorization(
    deviceCodeHash: string,
    clientId: string,
    nowMs: number,
  ): Promise<DeviceAuthorizationPoll> {
    const codeRef = this.deviceDb.collection('oauthDeviceCodes').doc(deviceCodeHash);
    return this.deviceDb.runTransaction(async (tx) => {
      const code = await tx.get(codeRef);
      if (!code.exists) return { ok: false, error: 'invalid_grant' };
      const rowRef = this.deviceDb
        .collection('oauthDeviceAuthorizations')
        .doc((code.data() as { userCode: string }).userCode);
      const snap = await tx.get(rowRef);
      if (!snap.exists) {
        tx.delete(codeRef);
        return { ok: false, error: 'invalid_grant' };
      }
      const row = snap.data() as OAuthDeviceAuthorization;
      if (row.deviceCodeHash !== deviceCodeHash || row.clientId !== clientId)
        return { ok: false, error: 'invalid_grant' };
      const result = deviceAuthorizationPoll(row, nowMs);
      if (result.ok || result.error === 'expired_token' || result.error === 'access_denied') {
        tx.delete(rowRef);
        tx.delete(codeRef);
      } else {
        tx.update(rowRef, { intervalSec: row.intervalSec, lastPollAt: row.lastPollAt });
      }
      return result;
    });
  }

  async eraseOAuthDeviceAuthorizations(ownerUid: string): Promise<void> {
    const rows = await this.deviceDb.collection('oauthDeviceAuthorizations').where('ownerUid', '==', ownerUid).get();
    for (const doc of rows.docs) {
      const row = doc.data() as OAuthDeviceAuthorization;
      const batch = this.deviceDb.batch();
      batch.delete(doc.ref);
      batch.delete(this.deviceDb.collection('oauthDeviceCodes').doc(row.deviceCodeHash));
      await batch.commit();
    }
  }
}
