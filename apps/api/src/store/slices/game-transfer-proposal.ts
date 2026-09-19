import type { GuardedFirestore } from '../shelf-guard-firestore.js';
import { fencedOut } from '../records/game-access.js';
import {
  newTransferProposal,
  proposalIsOpen,
  proposalIsRetained,
  proposalReceiptStatus,
  transferProposalReceiptKey,
  transferProposalRequestHash,
  type GameTransferProposal,
  type TransferProposalReceiptStatus,
} from '../records/game-transfer-proposal.js';

export type ProposeGameTransferResult =
  | { ok: true; proposal: GameTransferProposal }
  | { ok: false; reason: 'conflict' | 'busy' | 'stale_owner' | 'expired' | 'ineligible' };

function erasedOwner(user: { createdAt?: string } | null, erasedAt: string | null): boolean {
  if (erasedAt === null) return false;
  return user?.createdAt === undefined || fencedOut(erasedAt, user.createdAt);
}

function isCurrentOwner(
  access: { ownerUid: string; accessRevision: number } | null,
  ownerUid: string,
  accessRevision: number,
): boolean {
  return Boolean(access && access.ownerUid === ownerUid && access.accessRevision === accessRevision);
}

function openBlocks(
  open: GameTransferProposal | null,
  ownerUid: string,
  accessRevision: number,
  receiptKey: string,
  at: string,
): 'busy' | 'stale' | null {
  if (!open || !proposalIsOpen(open, at) || open.receiptKey === receiptKey) return null;
  if (open.ownerUid !== ownerUid || open.accessRevision !== accessRevision) return 'stale';
  return 'busy';
}

export interface TransferProposalReceipt {
  status: TransferProposalReceiptStatus;
  proposal?: GameTransferProposal;
}

export interface GameTransferProposalStore {
  proposeGameTransfer(input: {
    slug: string;
    ownerUid: string;
    accessRevision: number;
    expectedAccessVersion: string;
    idempotencyKey: string;
    at: string;
  }): Promise<ProposeGameTransferResult>;
  getTransferProposal(proposalId: string, at: string): Promise<GameTransferProposal | null>;
  getTransferProposalReceipt(ownerUid: string, idempotencyKey: string, at: string): Promise<TransferProposalReceipt>;
  confirmTransferProposal(proposalId: string, ownerUid: string, at: string): Promise<GameTransferProposal | null>;
  invalidateOpenTransferProposalsForSlug(slug: string, at: string): Promise<void>;
  eraseTransferProposalsForUid(uid: string, at: string): Promise<void>;
}

const clone = (row: GameTransferProposal): GameTransferProposal => ({ ...row });

function retained(row: GameTransferProposal | undefined, at: string): GameTransferProposal | null {
  if (!row || !proposalIsRetained(row, at)) return null;
  return clone(row);
}

export class InMemoryGameTransferProposalStore implements GameTransferProposalStore {
  constructor(
    private erasedAt: (uid: string) => string | null = () => null,
    private owner: (uid: string) => { createdAt?: string } | null = () => null,
    private gameAccess: (slug: string) => { ownerUid: string; accessRevision: number } | null = () => null,
  ) {}

  proposals = new Map<string, GameTransferProposal>();
  receipts = new Map<string, string>();
  openBySlug = new Map<string, string>();

  async proposeGameTransfer(input: {
    slug: string;
    ownerUid: string;
    accessRevision: number;
    expectedAccessVersion: string;
    idempotencyKey: string;
    at: string;
  }): Promise<ProposeGameTransferResult> {
    const receiptKey = transferProposalReceiptKey(input.ownerUid, input.idempotencyKey);
    const requestHash = transferProposalRequestHash(input.slug, input.expectedAccessVersion);
    const existingId = this.receipts.get(receiptKey);
    const existing = existingId ? retained(this.proposals.get(existingId), input.at) : null;
    if (existing) {
      if (existing.requestHash !== requestHash) return { ok: false, reason: 'conflict' };
      if (proposalReceiptStatus(existing, input.at) !== 'ready') return { ok: false, reason: 'expired' };
      return { ok: true, proposal: clone(existing) };
    }
    if (erasedOwner(this.owner(input.ownerUid), this.erasedAt(input.ownerUid))) {
      return { ok: false, reason: 'ineligible' };
    }
    if (!isCurrentOwner(this.gameAccess(input.slug), input.ownerUid, input.accessRevision)) {
      return { ok: false, reason: 'stale_owner' };
    }
    const openId = this.openBySlug.get(input.slug);
    const open = openId ? retained(this.proposals.get(openId), input.at) : null;
    const block = openBlocks(open, input.ownerUid, input.accessRevision, receiptKey, input.at);
    if (block === 'busy') return { ok: false, reason: 'busy' };
    if (block === 'stale' && open) {
      this.proposals.set(open.proposalId, { ...open, invalidatedAt: input.at });
      this.openBySlug.delete(input.slug);
    }
    const proposal = newTransferProposal(input);
    this.proposals.set(proposal.proposalId, proposal);
    this.receipts.set(receiptKey, proposal.proposalId);
    this.openBySlug.set(input.slug, proposal.proposalId);
    return { ok: true, proposal: clone(proposal) };
  }

  async getTransferProposal(proposalId: string, at: string): Promise<GameTransferProposal | null> {
    return retained(this.proposals.get(proposalId), at);
  }

  async getTransferProposalReceipt(
    ownerUid: string,
    idempotencyKey: string,
    at: string,
  ): Promise<TransferProposalReceipt> {
    const id = this.receipts.get(transferProposalReceiptKey(ownerUid, idempotencyKey));
    const proposal = id ? retained(this.proposals.get(id), at) : null;
    if (!proposal || proposal.ownerUid !== ownerUid) return { status: 'not_found' };
    return { status: proposalReceiptStatus(proposal, at), proposal };
  }

  async confirmTransferProposal(
    proposalId: string,
    ownerUid: string,
    at: string,
  ): Promise<GameTransferProposal | null> {
    const existing = retained(this.proposals.get(proposalId), at);
    if (!existing || existing.ownerUid !== ownerUid) return null;
    if (existing.confirmedAt) return clone(existing);
    if (!proposalIsOpen(existing, at)) return null;
    const confirmed: GameTransferProposal = { ...existing, confirmedAt: at };
    this.proposals.set(proposalId, confirmed);
    if (this.openBySlug.get(existing.slug) === proposalId) this.openBySlug.delete(existing.slug);
    return clone(confirmed);
  }

  async invalidateOpenTransferProposalsForSlug(slug: string, at: string): Promise<void> {
    const id = this.openBySlug.get(slug);
    const existing = id ? retained(this.proposals.get(id), at) : null;
    if (!existing || !proposalIsOpen(existing, at)) return;
    this.proposals.set(existing.proposalId, { ...existing, invalidatedAt: at });
    this.openBySlug.delete(slug);
  }

  async eraseTransferProposalsForUid(uid: string, at: string): Promise<void> {
    for (const [id, row] of this.proposals) {
      if (row.ownerUid !== uid) continue;
      if (proposalIsOpen(row, at)) this.proposals.set(id, { ...row, invalidatedAt: at });
      if (this.openBySlug.get(row.slug) === id) this.openBySlug.delete(row.slug);
    }
  }
}

export class FirestoreGameTransferProposalStore implements GameTransferProposalStore {
  constructor(private db: GuardedFirestore) {}

  private proposalDoc(id: string) {
    return this.db.collection('gameTransferProposals').doc(id);
  }

  private receiptDoc(key: string) {
    return this.db.collection('gameTransferProposalReceipts').doc(key);
  }

  private slugDoc(slug: string) {
    return this.db.collection('gameTransferProposalBySlug').doc(slug);
  }

  async proposeGameTransfer(input: {
    slug: string;
    ownerUid: string;
    accessRevision: number;
    expectedAccessVersion: string;
    idempotencyKey: string;
    at: string;
  }): Promise<ProposeGameTransferResult> {
    const receiptKey = transferProposalReceiptKey(input.ownerUid, input.idempotencyKey);
    const requestHash = transferProposalRequestHash(input.slug, input.expectedAccessVersion);
    return this.db.runTransaction(async (tx) => {
      const receiptSnap = await tx.get(this.receiptDoc(receiptKey));
      const existingId = receiptSnap.exists ? (receiptSnap.data() as { proposalId: string }).proposalId : null;
      const existingSnap = existingId ? await tx.get(this.proposalDoc(existingId)) : null;
      const fenceSnap = await tx.get(this.db.collection('erasedAccounts').doc(input.ownerUid));
      const userSnap = await tx.get(this.db.collection('users').doc(input.ownerUid));
      const existing =
        existingSnap?.exists && proposalIsRetained(existingSnap.data() as GameTransferProposal, input.at)
          ? (existingSnap.data() as GameTransferProposal)
          : null;
      if (existing) {
        if (existing.requestHash !== requestHash) return { ok: false as const, reason: 'conflict' as const };
        if (proposalReceiptStatus(existing, input.at) !== 'ready') {
          return { ok: false as const, reason: 'expired' as const };
        }
        return { ok: true as const, proposal: existing };
      }
      const erasedAt = fenceSnap.exists ? ((fenceSnap.data() as { at?: string }).at ?? null) : null;
      const user = userSnap.exists ? (userSnap.data() as { createdAt?: string }) : null;
      if (erasedOwner(user, erasedAt)) return { ok: false as const, reason: 'ineligible' as const };
      const accessSnap = await tx.get(this.db.collection('gameAccess').doc(input.slug));
      const access = accessSnap.exists ? (accessSnap.data() as { ownerUid: string; accessRevision: number }) : null;
      if (!isCurrentOwner(access, input.ownerUid, input.accessRevision)) {
        return { ok: false as const, reason: 'stale_owner' as const };
      }
      const slugSnap = await tx.get(this.slugDoc(input.slug));
      const openId = slugSnap.exists ? (slugSnap.data() as { proposalId: string }).proposalId : null;
      const openSnap = openId ? await tx.get(this.proposalDoc(openId)) : null;
      const open =
        openSnap?.exists && proposalIsRetained(openSnap.data() as GameTransferProposal, input.at)
          ? (openSnap.data() as GameTransferProposal)
          : null;
      const block = openBlocks(open, input.ownerUid, input.accessRevision, receiptKey, input.at);
      if (block === 'busy') return { ok: false as const, reason: 'busy' as const };
      if (block === 'stale' && open) {
        tx.set(this.proposalDoc(open.proposalId), { ...open, invalidatedAt: input.at });
      }
      const proposal = newTransferProposal(input);
      tx.set(this.proposalDoc(proposal.proposalId), proposal);
      tx.set(this.receiptDoc(receiptKey), { proposalId: proposal.proposalId, ownerUid: input.ownerUid });
      tx.set(this.slugDoc(input.slug), { proposalId: proposal.proposalId });
      return { ok: true as const, proposal };
    });
  }

  async getTransferProposal(proposalId: string, at: string): Promise<GameTransferProposal | null> {
    const snap = await this.proposalDoc(proposalId).get();
    if (!snap.exists) return null;
    const row = snap.data() as GameTransferProposal;
    return proposalIsRetained(row, at) ? row : null;
  }

  async getTransferProposalReceipt(
    ownerUid: string,
    idempotencyKey: string,
    at: string,
  ): Promise<TransferProposalReceipt> {
    const receiptSnap = await this.receiptDoc(transferProposalReceiptKey(ownerUid, idempotencyKey)).get();
    if (!receiptSnap.exists) return { status: 'not_found' };
    const proposalId = (receiptSnap.data() as { proposalId: string }).proposalId;
    const proposal = await this.getTransferProposal(proposalId, at);
    if (!proposal || proposal.ownerUid !== ownerUid) return { status: 'not_found' };
    return { status: proposalReceiptStatus(proposal, at), proposal };
  }

  async confirmTransferProposal(
    proposalId: string,
    ownerUid: string,
    at: string,
  ): Promise<GameTransferProposal | null> {
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.proposalDoc(proposalId));
      if (!snap.exists) return null;
      const existing = snap.data() as GameTransferProposal;
      if (!proposalIsRetained(existing, at) || existing.ownerUid !== ownerUid) return null;
      if (existing.confirmedAt) return existing;
      if (!proposalIsOpen(existing, at)) return null;
      const slugSnap = await tx.get(this.slugDoc(existing.slug));
      const confirmed: GameTransferProposal = { ...existing, confirmedAt: at };
      tx.set(this.proposalDoc(proposalId), confirmed);
      if (slugSnap.exists && (slugSnap.data() as { proposalId: string }).proposalId === proposalId) {
        tx.delete(this.slugDoc(existing.slug));
      }
      return confirmed;
    });
  }

  async invalidateOpenTransferProposalsForSlug(slug: string, at: string): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const slugSnap = await tx.get(this.slugDoc(slug));
      if (!slugSnap.exists) return;
      const id = (slugSnap.data() as { proposalId: string }).proposalId;
      const snap = await tx.get(this.proposalDoc(id));
      if (!snap.exists) return;
      const existing = snap.data() as GameTransferProposal;
      if (!proposalIsOpen(existing, at)) return;
      tx.set(this.proposalDoc(id), { ...existing, invalidatedAt: at });
      tx.delete(this.slugDoc(slug));
    });
  }

  async eraseTransferProposalsForUid(uid: string, at: string): Promise<void> {
    const snap = await this.db.collection('gameTransferProposals').where('ownerUid', '==', uid).get();
    for (const doc of snap.docs) {
      const row = doc.data() as GameTransferProposal;
      if (!proposalIsOpen(row, at)) continue;
      await this.db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (!current.exists) return;
        const latest = current.data() as GameTransferProposal;
        if (!proposalIsOpen(latest, at)) return;
        const slugRef = this.slugDoc(latest.slug);
        const slugSnap = await tx.get(slugRef);
        tx.set(doc.ref, { ...latest, invalidatedAt: at });
        if (slugSnap.exists && (slugSnap.data() as { proposalId: string }).proposalId === latest.proposalId) {
          tx.delete(slugRef);
        }
      });
    }
  }
}
