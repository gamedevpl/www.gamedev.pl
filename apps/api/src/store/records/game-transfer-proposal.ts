// MCP transfer proposal: a human-review row, not a GO-02 invitation.

import { createHash, randomUUID } from 'node:crypto';

export type TransferProposalReceiptStatus = 'not_found' | 'pending' | 'ready' | 'expired' | 'invalidated';

export interface GameTransferProposal {
  proposalId: string;
  slug: string;
  ownerUid: string;
  accessRevision: number;
  expectedAccessVersion: string;
  idempotencyKey: string;
  requestHash: string;
  receiptKey: string;
  createdAt: string;
  expiresAt: string;
  tombstoneUntil: string;
  invalidatedAt?: string;
  confirmedAt?: string;
}

// Human confirm same day; no recipient chosen yet.
export const TRANSFER_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
// Lost MCP response: receipt exists immediately.
export const TRANSFER_PROPOSAL_RETRY_WINDOW_MS = 15 * 60 * 1000;
// Late retry must not recreate a tombstoned row.
export const TRANSFER_PROPOSAL_TOMBSTONE_MS = 8 * 24 * 60 * 60 * 1000;

export function opaqueAccessVersion(accessRevision: number): string {
  return `v${accessRevision}`;
}

export function parseAccessVersion(value: string): number | null {
  const match = /^v(\d+)$/.exec(value);
  if (!match) return null;
  return Number(match[1]);
}

export function transferProposalRequestHash(slug: string, expectedAccessVersion: string): string {
  return createHash('sha256').update(`${slug}\0${expectedAccessVersion}`).digest('hex');
}

export function transferProposalReceiptKey(ownerUid: string, idempotencyKey: string): string {
  return createHash('sha256').update(`xfer-prop\0${ownerUid}\0${idempotencyKey}`).digest('hex');
}

export function transferProposalReviewPath(slug: string, proposalId: string): string {
  return `/studio/${encodeURIComponent(slug)}/transfer/propose/${encodeURIComponent(proposalId)}`;
}

export function newTransferProposal(input: {
  slug: string;
  ownerUid: string;
  accessRevision: number;
  expectedAccessVersion: string;
  idempotencyKey: string;
  at: string;
}): GameTransferProposal {
  const created = Date.parse(input.at);
  return {
    proposalId: randomUUID(),
    slug: input.slug,
    ownerUid: input.ownerUid,
    accessRevision: input.accessRevision,
    expectedAccessVersion: input.expectedAccessVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: transferProposalRequestHash(input.slug, input.expectedAccessVersion),
    receiptKey: transferProposalReceiptKey(input.ownerUid, input.idempotencyKey),
    createdAt: input.at,
    expiresAt: new Date(created + TRANSFER_PROPOSAL_TTL_MS).toISOString(),
    tombstoneUntil: new Date(created + TRANSFER_PROPOSAL_TOMBSTONE_MS).toISOString(),
  };
}

export function proposalReceiptStatus(
  proposal: GameTransferProposal,
  at: string,
): Exclude<TransferProposalReceiptStatus, 'not_found' | 'pending'> {
  if (proposal.confirmedAt || proposal.invalidatedAt) return 'invalidated';
  if (proposal.expiresAt <= at) return 'expired';
  return 'ready';
}

export function proposalIsRetained(proposal: GameTransferProposal, at: string): boolean {
  return proposal.tombstoneUntil > at;
}

export function proposalIsOpen(proposal: GameTransferProposal, at: string): boolean {
  return proposalReceiptStatus(proposal, at) === 'ready';
}
