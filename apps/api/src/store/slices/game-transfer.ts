import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { membersOf, type GameAccessRecord } from '../records/game-access.js';
import {
  effectiveStatus,
  isPending,
  newTransferInvitation,
  type GameTransferInvitation,
} from '../records/game-transfer.js';
import { isActiveBuildRound, revokedRoundGeneration } from '../../creation/job-state.js';
import type { JobState } from '@gamedevpl/contract';
import type { JobTransition } from '../../creation/job-state.js';

export interface GameTransferStore {
  // Status is materialized against `at`; a stale pending row reads as expired.
  getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null>;

  // 'busy'/'ineligible'/'stale_owner': pending, an erased party, a stale owner.
  createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
    recipientCode?: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner'>;

  // Null: not found, caller mismatch, or answering a different offer.
  acceptGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner' | null>;

  // Null when not pending, not the sender, or another offer.
  cancelGameTransferInvitation(
    slug: string,
    senderUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | null>;

  // Null when not pending, not the recipient, or another offer.
  rejectGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | null>;

  // Every invitation still pending for uid as recipient.
  listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]>;
}

const clone = (invite: GameTransferInvitation): GameTransferInvitation => ({ ...invite });

// Whether a response is answering the invitation it names.

// An id-less caller matches only a pre-migration row.
function answersInvitation(invite: GameTransferInvitation, invitationId: string | undefined): boolean {
  if (invitationId === undefined) return invite.invitationId === undefined;
  return invite.invitationId === invitationId;
}

// No canonical record: never current, whatever revision was sent.
function ownerMatches(access: GameAccessRecord, uid: string, revision: number): boolean {
  return access.ownerUid === uid && access.accessRevision === revision;
}

// Recheck eligibility at commit time; erasure races are fenced separately.
function recipientEligible(recipient: { tier: string; deletionScheduledFor?: string } | null): boolean {
  if (!recipient) return true;
  return recipient.tier !== 'blocked' && !recipient.deletionScheduledFor;
}

// Default: the former owner loses management access (editors are GO-03 scope).
function transferredAccess(access: GameAccessRecord, newOwnerUid: string, at: string): GameAccessRecord {
  return {
    ...access,
    ownerUid: newOwnerUid,
    editorUids: [],
    memberUids: membersOf(newOwnerUid, []),
    accessRevision: access.accessRevision + 1,
    updatedAt: at,
  };
}

// Bounded because one transaction caps its writes, and round keys expire anyway.
export const MAX_REVOKED_ROUNDS_PER_TRANSFER = 200;

// Newest first, so the bound keeps rounds that may hold a key.
function newestRounds<T extends { data: () => unknown }>(docs: readonly T[]): T[] {
  return [...docs]
    .sort((a, b) => {
      const left = a.data() as { createdAt?: string; jobId?: number };
      const right = b.data() as { createdAt?: string; jobId?: number };
      return (right.createdAt ?? '').localeCompare(left.createdAt ?? '') || (right.jobId ?? 0) - (left.jobId ?? 0);
    })
    .slice(0, MAX_REVOKED_ROUNDS_PER_TRANSFER);
}

export class InMemoryGameTransferStore implements GameTransferStore {
  // Not private -- deleteAccountIdentity reaches across this on erasure.
  transfers = new Map<string, GameTransferInvitation>();

  constructor(
    private isErased: (uid: string) => boolean = () => false,
    private getGameAccess: (slug: string) => GameAccessRecord | null = () => null,
    private getUser: (uid: string) => { tier: string; deletionScheduledFor?: string } | null = () => null,
    private getRecipientCodeOwner: (code: string) => string | null = () => null,
    private writeGameAccess: (slug: string, record: GameAccessRecord) => void = () => {},
    private hasActiveBuildRound: (slug: string) => boolean = () => false,
    // A held lease means a round could still open under the sender.
    private hasActiveCheckoutRecovery: (slug: string, now: number) => Promise<boolean> = () => Promise.resolve(false),
    // Stale sender lock: retire it for a fresh one next time.
    private retireGameAgentKey: (slug: string) => void = () => {},
    // The recipient never opted into the sender's autonomy consent.
    private resetGameAutonomy: (slug: string) => void = () => {},
    // Revokes the sender's round channel, session, upload and opener tokens.
    private revokeRoundCapabilities: (slug: string) => void = () => {},
  ) {}

  async getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null> {
    const existing = this.transfers.get(slug);
    if (!existing) return null;
    return { ...clone(existing), status: effectiveStatus(existing, at) };
  }

  async createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
    recipientCode?: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner'> {
    if (this.isErased(senderUid) || this.isErased(recipientUid)) return 'ineligible';
    if (!recipientEligible(this.getUser(recipientUid))) return 'ineligible';
    if (recipientCode !== undefined && this.getRecipientCodeOwner(recipientCode) !== recipientUid) return 'ineligible';
    const access = this.getGameAccess(slug);
    if (!access || !ownerMatches(access, senderUid, accessRevision)) return 'stale_owner';

    // A pending row from a superseded owner does not block this one.
    const existing = this.transfers.get(slug) ?? null;
    const existingCurrent = existing !== null && ownerMatches(access, existing.senderUid, existing.accessRevision);
    if (existingCurrent && isPending(existing, at)) return 'busy';

    const invite = newTransferInvitation(slug, senderUid, recipientUid, accessRevision, at);
    this.transfers.set(slug, invite);
    return clone(invite);
  }

  async acceptGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner' | null> {
    const existing = this.transfers.get(slug) ?? null;
    if (!existing || existing.recipientUid !== recipientUid) return null;
    if (!answersInvitation(existing, invitationId)) return null;
    if (existing.status === 'accepted') return clone(existing);
    if (!isPending(existing, at)) return null;

    if (this.isErased(existing.senderUid) || this.isErased(recipientUid)) return 'ineligible';
    if (!recipientEligible(this.getUser(recipientUid))) return 'ineligible';

    const access = this.getGameAccess(slug);
    if (!access || !ownerMatches(access, existing.senderUid, existing.accessRevision)) return 'stale_owner';

    // Idle only: a live build/write or opening round blocks this.
    if (this.hasActiveBuildRound(slug) || (await this.hasActiveCheckoutRecovery(slug, Date.parse(at)))) return 'busy';

    this.writeGameAccess(slug, transferredAccess(access, recipientUid, at));
    this.retireGameAgentKey(slug);
    this.resetGameAutonomy(slug);
    this.revokeRoundCapabilities(slug);
    const accepted: GameTransferInvitation = { ...existing, status: 'accepted', respondedAt: at };
    this.transfers.set(slug, accepted);
    return clone(accepted);
  }

  async cancelGameTransferInvitation(
    slug: string,
    senderUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | null> {
    const existing = this.transfers.get(slug) ?? null;
    if (!isPending(existing, at) || existing.senderUid !== senderUid) return null;
    if (!answersInvitation(existing, invitationId)) return null;
    const updated: GameTransferInvitation = { ...existing, status: 'cancelled', respondedAt: at };
    this.transfers.set(slug, updated);
    return clone(updated);
  }

  async rejectGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | null> {
    const existing = this.transfers.get(slug) ?? null;
    if (!isPending(existing, at) || existing.recipientUid !== recipientUid) return null;
    if (!answersInvitation(existing, invitationId)) return null;
    const updated: GameTransferInvitation = { ...existing, status: 'rejected', respondedAt: at };
    this.transfers.set(slug, updated);
    return clone(updated);
  }

  async listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]> {
    return [...this.transfers.values()].filter((t) => t.recipientUid === uid && isPending(t, at)).map(clone);
  }
}

export class FirestoreGameTransferStore implements GameTransferStore {
  constructor(private db: Firestore) {}

  private doc(slug: string) {
    return this.db.collection('gameTransfers').doc(slug);
  }

  // Same fence collection gameAccessStore writes on erasure.
  private erasureFence(uid: string) {
    return this.db.collection('erasedAccounts').doc(uid);
  }

  async getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null> {
    const snap = await this.doc(slug).get();
    if (!snap.exists) return null;
    const record = snap.data() as GameTransferInvitation;
    return { ...record, status: effectiveStatus(record, at) };
  }

  async createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
    recipientCode?: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner'> {
    const ref = this.doc(slug);
    const accessRef = this.db.collection('gameAccess').doc(slug);
    const recipientRef = this.db.collection('users').doc(recipientUid);
    const codeRef = recipientCode !== undefined ? this.db.collection('recipientCodes').doc(recipientCode) : null;
    return this.db.runTransaction(async (tx) => {
      const [snap, senderFence, recipientFence, accessSnap, recipientSnap, codeSnap] = await Promise.all([
        tx.get(ref),
        tx.get(this.erasureFence(senderUid)),
        tx.get(this.erasureFence(recipientUid)),
        tx.get(accessRef),
        tx.get(recipientRef),
        codeRef ? tx.get(codeRef) : Promise.resolve(null),
      ]);
      if (senderFence.exists || recipientFence.exists) return 'ineligible';

      // Re-read at commit time, not the route's earlier code lookup.
      const recipient = recipientSnap.exists
        ? (recipientSnap.data() as { tier: string; deletionScheduledFor?: string })
        : null;
      if (!recipientEligible(recipient)) return 'ineligible';

      // A rotation between lookup and commit revokes the code.
      if (codeSnap && (!codeSnap.exists || (codeSnap.data() as { uid: string }).uid !== recipientUid)) {
        return 'ineligible';
      }

      const access = accessSnap.exists ? (accessSnap.data() as GameAccessRecord) : null;
      if (!access || !ownerMatches(access, senderUid, accessRevision)) return 'stale_owner';

      // A pending row from a superseded owner does not block this one.
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      const existingCurrent = existing !== null && ownerMatches(access, existing.senderUid, existing.accessRevision);
      if (existingCurrent && isPending(existing, at)) return 'busy';

      const invite = newTransferInvitation(slug, senderUid, recipientUid, accessRevision, at);
      tx.set(ref, invite);
      return invite;
    });
  }

  async acceptGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner' | null> {
    const ref = this.doc(slug);
    const accessRef = this.db.collection('gameAccess').doc(slug);
    const gameRef = this.db.collection('games').doc(slug);
    const agentKeyRef = this.db.collection('gameAgentKeys').doc(slug);
    const activeQuery = this.db.collection('submissions').where('slug', '==', slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      if (!existing || existing.recipientUid !== recipientUid) return null;
      if (!answersInvitation(existing, invitationId)) return null;
      if (existing.status === 'accepted') return existing;
      if (!isPending(existing, at)) return null;

      const [senderFence, recipientFence, recipientSnap, accessSnap, activeSnap, gameSnap, agentKeySnap] =
        await Promise.all([
          tx.get(this.erasureFence(existing.senderUid)),
          tx.get(this.erasureFence(recipientUid)),
          tx.get(this.db.collection('users').doc(recipientUid)),
          tx.get(accessRef),
          tx.get(activeQuery),
          tx.get(gameRef),
          tx.get(agentKeyRef),
        ]);
      if (senderFence.exists || recipientFence.exists) return 'ineligible';

      const recipient = recipientSnap.exists
        ? (recipientSnap.data() as { tier: string; deletionScheduledFor?: string })
        : null;
      if (!recipientEligible(recipient)) return 'ineligible';

      const access = accessSnap.exists ? (accessSnap.data() as GameAccessRecord) : null;
      if (!access || !ownerMatches(access, existing.senderUid, existing.accessRevision)) return 'stale_owner';

      // Idle only: a live build/write or opening round blocks this.
      const busy =
        activeSnap.docs.some((doc) =>
          isActiveBuildRound(doc.data() as { state?: JobState; transitions?: JobTransition[] }),
        ) || (gameSnap.data()?.recoveryAdmission?.until ?? 0) > Date.parse(at);
      if (busy) return 'busy';

      tx.set(accessRef, transferredAccess(access, recipientUid, at));
      // Revokes the sender's round channel, session, upload and opener tokens.
      for (const doc of newestRounds(activeSnap.docs)) {
        const current = (doc.data() as { roundGeneration?: number }).roundGeneration;
        tx.update(doc.ref, { roundGeneration: revokedRoundGeneration(current) });
      }
      // Stale sender lock: retire it for a fresh one next time.
      if (agentKeySnap.exists) tx.delete(agentKeyRef);
      // The recipient never opted into the sender's autonomy consent.
      if (gameSnap.data()?.autonomy !== undefined) tx.update(gameRef, { autonomy: FieldValue.delete() });
      const accepted: GameTransferInvitation = { ...existing, status: 'accepted', respondedAt: at };
      tx.set(ref, accepted);
      return accepted;
    });
  }

  async cancelGameTransferInvitation(
    slug: string,
    senderUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | null> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      if (!isPending(existing, at) || existing.senderUid !== senderUid) return null;
      if (!answersInvitation(existing, invitationId)) return null;
      const updated: GameTransferInvitation = { ...existing, status: 'cancelled', respondedAt: at };
      tx.set(ref, updated);
      return updated;
    });
  }

  async rejectGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
    invitationId?: string,
  ): Promise<GameTransferInvitation | null> {
    const ref = this.doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as GameTransferInvitation) : null;
      if (!isPending(existing, at) || existing.recipientUid !== recipientUid) return null;
      if (!answersInvitation(existing, invitationId)) return null;
      const updated: GameTransferInvitation = { ...existing, status: 'rejected', respondedAt: at };
      tx.set(ref, updated);
      return updated;
    });
  }

  // A plain `.limit()` can return only stale rows, hiding an active one.

  // Pages by document-snapshot cursor instead -- no composite index needed.

  // No cap: a partial scan can silently drop a real invitation.
  private static readonly PAGE_SIZE = 200;

  async listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]> {
    const base = this.db.collection('gameTransfers').where('recipientUid', '==', uid).where('status', '==', 'pending');

    const active: GameTransferInvitation[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = cursor
        ? base.startAfter(cursor).limit(FirestoreGameTransferStore.PAGE_SIZE)
        : base.limit(FirestoreGameTransferStore.PAGE_SIZE);
      const snap = await page.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        const invite = doc.data() as GameTransferInvitation;
        if (isPending(invite, at)) active.push(invite);
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < FirestoreGameTransferStore.PAGE_SIZE) break;
    }
    return active;
  }
}
