import { describe, expect, it } from 'vitest';
import {
  newTransferProposal,
  opaqueAccessVersion,
  parseAccessVersion,
  proposalIsOpen,
  proposalIsRetained,
  proposalReceiptStatus,
  TRANSFER_PROPOSAL_TTL_MS,
  TRANSFER_PROPOSAL_TOMBSTONE_MS,
  transferProposalReceiptKey,
  transferProposalRequestHash,
  transferProposalReviewPath,
} from './game-transfer-proposal.js';

const AT = '2026-01-01T00:00:00.000Z';

describe('transfer proposal records', () => {
  it('parses opaque access versions', () => {
    expect(opaqueAccessVersion(1)).toBe('v1');
    expect(parseAccessVersion('v12')).toBe(12);
    expect(parseAccessVersion('12')).toBeNull();
  });

  it('binds receipt keys to the owner and request hashes to slug+version', () => {
    expect(transferProposalReceiptKey('g:ada', 'k1')).not.toBe(transferProposalReceiptKey('g:bea', 'k1'));
    expect(transferProposalRequestHash('sky', 'v1')).not.toBe(transferProposalRequestHash('sky', 'v2'));
    expect(transferProposalReviewPath('sky', 'id-1')).toBe('/studio/sky/transfer/propose/id-1');
  });

  it('opens for a day and retains a tombstone past expiry', () => {
    const row = newTransferProposal({
      slug: 'sky',
      ownerUid: 'g:ada',
      accessRevision: 1,
      expectedAccessVersion: 'v1',
      idempotencyKey: 'k1',
      at: AT,
    });
    const created = Date.parse(AT);
    expect(proposalIsOpen(row, AT)).toBe(true);
    expect(proposalReceiptStatus(row, new Date(created + TRANSFER_PROPOSAL_TTL_MS).toISOString())).toBe('expired');
    expect(proposalIsRetained(row, new Date(created + TRANSFER_PROPOSAL_TTL_MS).toISOString())).toBe(true);
    expect(proposalIsRetained(row, new Date(created + TRANSFER_PROPOSAL_TOMBSTONE_MS).toISOString())).toBe(false);
  });
});
