import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { WaitlistStatus } from '@gamedevpl/contract';
import type { WaitlistEntry, BetaInvite, CreatedBetaInvite, ClaimBetaInviteResult } from '../records/access.js';
import { stripUndefined } from '../firestore-util.js';

const BETA_INVITE_CODE_BYTES = 24;

function hashBetaInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export interface AccessStore {
  upsertWaitlistEntry(entry: { uid: string; email?: string; name?: string; locale?: string }): Promise<WaitlistEntry>;

  getWaitlistEntry(uid: string): Promise<WaitlistEntry | null>;

  isWaitlistApproved(uid: string, email?: string): Promise<boolean>;

  setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null>;

  /**
   * Operator listing of the closed-beta waitlist.
   *
   * Sorted newest-request first. When `status` is set, only that status is returned.
   * Bounded by `limit` (default 200) so a growing list cannot ship the whole collection
   * in one console poll — at closed-beta scale the cap is generous; past that the panel
   * filters by status rather than paging.
   */
  listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]>;

  /** Cheap count for the console tab badge. Optional status filter. */
  countWaitlistEntries(status?: WaitlistStatus): Promise<number>;

  /**
   * Approve / reject / reset by email — including pre-approval before the person has
   * ever visited. Mirrors `npm run beta:approve`: finds an existing row by email, or
   * creates `waitlist/email:<lower>` with the requested status.
   */
  setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry>;

  // Invite claim becomes membership; keeps requestedAt. See docs/deployment.md.
  recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry>;

  createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite>;

  listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]>;

  claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult>;

  revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null>;
}

export class InMemoryAccessStore implements AccessStore {
  // Not private -- deleteAccountIdentity and waitlistEntries reach across these
  // (documented exception, see PR).
  waitlist = new Map<string, WaitlistEntry>();
  betaInvites = new Map<string, BetaInvite>();

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const existing = this.waitlist.get(entry.uid);
    // Lowercase at write so equality queries (Firestore `where email ==`) and the
    // pre-approve path agree — mixed-case joins used to miss and mint a second row.
    const rawEmail = entry.email ?? existing?.email;

    const updated: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name ?? existing?.name,
      requestedAt: now,
      locale: entry.locale ?? existing?.locale,
      status: existing?.status ?? 'pending',
    };

    this.waitlist.set(entry.uid, updated);
    return { ...updated };
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const entry = this.waitlist.get(uid);
    return entry ? { ...entry } : null;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const byUid = this.waitlist.get(uid);
    if (byUid?.status === 'approved') return true;
    if (email) {
      const emailLower = email.toLowerCase();
      for (const entry of this.waitlist.values()) {
        if (entry.email?.toLowerCase() === emailLower && entry.status === 'approved') {
          return true;
        }
      }
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const existing = this.waitlist.get(uid);
    if (!existing) return null;
    const updated: WaitlistEntry = { ...existing, status };
    this.waitlist.set(uid, updated);
    return { ...updated };
  }

  async listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]> {
    const limit = opts?.limit ?? 200;
    const rows = Array.from(this.waitlist.values()).filter(
      (entry) => opts?.status === undefined || entry.status === opts.status,
    );
    rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return rows.slice(0, limit).map((entry) => ({ ...entry }));
  }

  async countWaitlistEntries(status?: WaitlistStatus): Promise<number> {
    if (status === undefined) return this.waitlist.size;
    let count = 0;
    for (const entry of this.waitlist.values()) {
      if (entry.status === status) count += 1;
    }
    return count;
  }

  async setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry> {
    const emailLower = email.toLowerCase();
    for (const entry of this.waitlist.values()) {
      if (entry.email?.toLowerCase() === emailLower) {
        const updated: WaitlistEntry = { ...entry, status };
        this.waitlist.set(entry.uid, updated);
        return { ...updated };
      }
    }
    const now = new Date().toISOString();
    const created: WaitlistEntry = {
      uid: `email:${emailLower}`,
      email: emailLower,
      requestedAt: now,
      status,
    };
    this.waitlist.set(created.uid, created);
    return { ...created };
  }

  async recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const existing = this.waitlist.get(entry.uid);
    const rawEmail = entry.email ?? existing?.email;

    const updated: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name ?? existing?.name,
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      locale: entry.locale ?? existing?.locale,
      status: 'approved',
    };

    this.waitlist.set(entry.uid, updated);
    return { ...updated };
  }

  async createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite> {
    const code = randomBytes(BETA_INVITE_CODE_BYTES).toString('base64url');
    const invite: BetaInvite = {
      id: randomUUID(),
      codeHash: hashBetaInviteCode(code),
      createdAt: new Date().toISOString(),
      createdByUid,
      status: 'available',
    };
    this.betaInvites.set(invite.id, invite);
    return { invite: { ...invite }, code };
  }

  async listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]> {
    const limit = opts?.limit ?? 200;
    return [...this.betaInvites.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((invite) => ({ ...invite }));
  }

  async claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult> {
    const codeHash = hashBetaInviteCode(code);
    const invite = [...this.betaInvites.values()].find((candidate) => candidate.codeHash === codeHash);
    if (!invite) return { ok: false, reason: 'not_found' };
    if (invite.status === 'revoked') return { ok: false, reason: 'revoked' };
    if (invite.status === 'claimed') {
      return invite.claimedUid === uid ? { ok: true, invite: { ...invite } } : { ok: false, reason: 'claimed' };
    }

    const claimed: BetaInvite = {
      ...invite,
      status: 'claimed',
      claimedAt: new Date().toISOString(),
      claimedUid: uid,
    };
    this.betaInvites.set(invite.id, claimed);
    return { ok: true, invite: { ...claimed } };
  }

  async revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null> {
    const invite = this.betaInvites.get(id);
    if (!invite || invite.status !== 'available') return null;
    const revoked: BetaInvite = {
      ...invite,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedByUid,
    };
    this.betaInvites.set(id, revoked);
    return { ...revoked };
  }
}

export class FirestoreAccessStore implements AccessStore {
  constructor(private db: Firestore) {}

  async upsertWaitlistEntry(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const now = new Date().toISOString();
    const docRef = this.db.collection('waitlist').doc(entry.uid);
    const snap = await docRef.get();
    const existing = snap.exists ? (snap.data() as WaitlistEntry) : null;
    // Same normalisation as InMemoryStore: email queries are case-sensitive in
    // Firestore, and setWaitlistStatusByEmail / isWaitlistApproved look up the
    // lowercased form.
    const rawEmail = entry.email !== undefined ? entry.email : existing?.email;

    const record: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name,
      requestedAt: now,
      locale: entry.locale,
      status: existing?.status ?? 'pending',
    };
    await docRef.set(stripUndefined(record), { merge: true });
    return record;
  }

  async getWaitlistEntry(uid: string): Promise<WaitlistEntry | null> {
    const snap = await this.db.collection('waitlist').doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as WaitlistEntry;
  }

  async isWaitlistApproved(uid: string, email?: string): Promise<boolean> {
    const uidSnap = await this.db.collection('waitlist').doc(uid).get();
    if (uidSnap.exists && (uidSnap.data() as WaitlistEntry).status === 'approved') {
      return true;
    }
    if (email) {
      const emailLower = email.toLowerCase();
      const emailQuery = await this.db
        .collection('waitlist')
        .where('email', '==', emailLower)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      if (!emailQuery.empty) return true;
    }
    return false;
  }

  async setWaitlistStatus(uid: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
    const docRef = this.db.collection('waitlist').doc(uid);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    await docRef.update({ status });
    const updatedSnap = await docRef.get();
    return updatedSnap.data() as WaitlistEntry;
  }

  async listWaitlistEntries(opts?: { status?: WaitlistStatus; limit?: number }): Promise<WaitlistEntry[]> {
    // Equality-only (no orderBy) so a status filter needs no composite index; sort and
    // slice in memory. The waitlist stays small at closed-beta scale, and the same
    // posture as `listAccessTokens` keeps an operator page from depending on a new
    // index that only fails in production.
    const limit = opts?.limit ?? 200;
    const collection = this.db.collection('waitlist');
    const snap =
      opts?.status === undefined ? await collection.get() : await collection.where('status', '==', opts.status).get();
    const rows = snap.docs.map((doc) => doc.data() as WaitlistEntry);
    rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return rows.slice(0, limit);
  }

  async countWaitlistEntries(status?: WaitlistStatus): Promise<number> {
    const collection = this.db.collection('waitlist');
    const query = status === undefined ? collection : collection.where('status', '==', status);
    const snap = await query.count().get();
    return snap.data().count;
  }

  async setWaitlistStatusByEmail(email: string, status: WaitlistStatus): Promise<WaitlistEntry> {
    const emailLower = email.toLowerCase();
    const querySnap = await this.db.collection('waitlist').where('email', '==', emailLower).limit(1).get();
    if (!querySnap.empty) {
      const doc = querySnap.docs[0]!;
      await doc.ref.update({ status });
      return { ...(doc.data() as WaitlistEntry), status, email: emailLower };
    }
    // Rows written before email was normalised may still hold mixed case; find and
    // heal them so an approve does not mint a duplicate `email:` doc beside the
    // original join. Cheap at closed-beta scale (one collection read, operator-only).
    const legacySnap = await this.db.collection('waitlist').get();
    const legacy = legacySnap.docs.find((doc) => (doc.data() as WaitlistEntry).email?.toLowerCase() === emailLower);
    if (legacy) {
      await legacy.ref.update({ status, email: emailLower });
      return { ...(legacy.data() as WaitlistEntry), status, email: emailLower };
    }
    const now = new Date().toISOString();
    const created: WaitlistEntry = {
      uid: `email:${emailLower}`,
      email: emailLower,
      requestedAt: now,
      status,
    };
    await this.db.collection('waitlist').doc(created.uid).set(stripUndefined(created));
    return created;
  }

  async recordBetaInviteAdmission(entry: {
    uid: string;
    email?: string;
    name?: string;
    locale?: string;
  }): Promise<WaitlistEntry> {
    const docRef = this.db.collection('waitlist').doc(entry.uid);
    const snap = await docRef.get();
    const existing = snap.exists ? (snap.data() as WaitlistEntry) : null;
    const rawEmail = entry.email !== undefined ? entry.email : existing?.email;

    const record: WaitlistEntry = {
      uid: entry.uid,
      email: rawEmail !== undefined ? rawEmail.toLowerCase() : undefined,
      name: entry.name ?? existing?.name,
      requestedAt: existing?.requestedAt ?? new Date().toISOString(),
      locale: entry.locale ?? existing?.locale,
      status: 'approved',
    };
    await docRef.set(stripUndefined(record), { merge: true });
    return record;
  }

  async createBetaInvite(createdByUid: string): Promise<CreatedBetaInvite> {
    const code = randomBytes(BETA_INVITE_CODE_BYTES).toString('base64url');
    const invite: BetaInvite = {
      id: randomUUID(),
      codeHash: hashBetaInviteCode(code),
      createdAt: new Date().toISOString(),
      createdByUid,
      status: 'available',
    };
    await this.db.collection('betaInvites').doc(invite.id).set(stripUndefined(invite));
    return { invite, code };
  }

  async listBetaInvites(opts?: { limit?: number }): Promise<BetaInvite[]> {
    const limit = opts?.limit ?? 200;
    const snap = await this.db.collection('betaInvites').get();
    return snap.docs
      .map((doc) => doc.data() as BetaInvite)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async claimBetaInvite(code: string, uid: string): Promise<ClaimBetaInviteResult> {
    const codeHash = hashBetaInviteCode(code);
    const querySnap = await this.db.collection('betaInvites').where('codeHash', '==', codeHash).limit(1).get();
    if (querySnap.empty) return { ok: false, reason: 'not_found' };

    const docRef = querySnap.docs[0]!.ref;
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) return { ok: false, reason: 'not_found' };
      const invite = snap.data() as BetaInvite;
      if (invite.status === 'revoked') return { ok: false, reason: 'revoked' };
      if (invite.status === 'claimed') {
        return invite.claimedUid === uid ? { ok: true, invite } : { ok: false, reason: 'claimed' };
      }

      const claimed: BetaInvite = {
        ...invite,
        status: 'claimed',
        claimedAt: new Date().toISOString(),
        claimedUid: uid,
      };
      transaction.set(docRef, stripUndefined(claimed), { merge: true });
      return { ok: true, invite: claimed };
    });
  }

  async revokeBetaInvite(id: string, revokedByUid: string): Promise<BetaInvite | null> {
    const docRef = this.db.collection('betaInvites').doc(id);
    return await this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) return null;
      const invite = snap.data() as BetaInvite;
      if (invite.status !== 'available') return null;

      const revoked: BetaInvite = {
        ...invite,
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        revokedByUid,
      };
      transaction.set(docRef, stripUndefined(revoked), { merge: true });
      return revoked;
    });
  }
}
