import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';
import { TRANSFER_PROPOSAL_TTL_MS, TRANSFER_PROPOSAL_TOMBSTONE_MS } from '../records/game-transfer-proposal.js';

const AT = '2026-01-01T00:00:00.000Z';
const A = 'g:ada';
const B = 'g:bea';
const SLUG = 'sky';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

async function seedOwner(store: Store) {
  await store.upsertUser({ uid: A });
  await store.upsertUser({ uid: B });
  await store.ensureGameAccess(SLUG, A, AT, AT);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

for (const [implName, makeStore] of IMPLEMENTATIONS) {
  describe(`game transfer proposals: ${implName}`, () => {
    it('replays the same key and payload', async () => {
      const store = makeStore();
      await seedOwner(store);
      const first = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      const again = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      expect(first).toMatchObject({ ok: true });
      expect(again).toMatchObject({ ok: true });
      if (!first.ok || !again.ok) throw new Error('unreachable');
      expect(again.proposal.proposalId).toBe(first.proposal.proposalId);
    });

    it('conflicts when the same key carries a different request', async () => {
      const store = makeStore();
      await seedOwner(store);
      await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      const clash = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v2',
        idempotencyKey: 'k1',
        at: AT,
      });
      expect(clash).toEqual({ ok: false, reason: 'conflict' });
    });

    it('refuses a second open proposal on the same slug', async () => {
      const store = makeStore();
      await seedOwner(store);
      await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      const busy = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k2',
        at: AT,
      });
      expect(busy).toEqual({ ok: false, reason: 'busy' });
    });

    it('does not recreate after expiry while the tombstone is retained', async () => {
      const store = makeStore();
      await seedOwner(store);
      const created = Date.parse(AT);
      await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      const late = iso(created + TRANSFER_PROPOSAL_TTL_MS + 1);
      const retry = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: late,
      });
      expect(retry).toEqual({ ok: false, reason: 'expired' });
      const receipt = await store.getTransferProposalReceipt(A, 'k1', late);
      expect(receipt.status).toBe('expired');
    });

    it('allows a new proposal after the tombstone lapses', async () => {
      const store = makeStore();
      await seedOwner(store);
      const created = Date.parse(AT);
      const first = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      if (!first.ok) throw new Error('unreachable');
      const after = iso(created + TRANSFER_PROPOSAL_TOMBSTONE_MS + 1);
      const next = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: after,
      });
      expect(next).toMatchObject({ ok: true });
      if (!next.ok) throw new Error('unreachable');
      expect(next.proposal.proposalId).not.toBe(first.proposal.proposalId);
    });

    it('invalidates an open proposal when a transfer is accepted', async () => {
      const store = makeStore();
      await seedOwner(store);
      const proposed = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      if (!proposed.ok) throw new Error('unreachable');
      const code = (await store.ensureRecipientCode(B, AT))!;
      await store.createGameTransferInvitation(SLUG, A, B, 1, AT, code);
      const invite = (await store.getActiveGameTransfer(SLUG, AT))!;
      await store.acceptGameTransferInvitation(SLUG, B, AT, invite.invitationId);
      const receipt = await store.getTransferProposalReceipt(A, 'k1', AT);
      expect(receipt.status).toBe('invalidated');
    });

    it('invalidates open proposals when the owner account is erased', async () => {
      const store = makeStore();
      await seedOwner(store);
      await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      await store.deleteAccountIdentity(A, AT);
      const receipt = await store.getTransferProposalReceipt(A, 'k1', AT);
      expect(receipt.status).toBe('invalidated');
    });

    it('refuses a new proposal from an erased owner', async () => {
      const store = makeStore();
      await seedOwner(store);
      await store.beginAccountErasure(A, '2099-01-01T00:00:00.000Z');
      const refused = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k-erased',
        at: AT,
      });
      expect(refused).toEqual({ ok: false, reason: 'ineligible' });
    });

    it('clears a stale-revision open proposal so a new key can proceed', async () => {
      const store = makeStore();
      await seedOwner(store);
      const first = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 1,
        expectedAccessVersion: 'v1',
        idempotencyKey: 'k1',
        at: AT,
      });
      if (!first.ok) throw new Error('unreachable');
      const editorCode = (await store.ensureRecipientCode(B, AT))!;
      await store.createEditorInvitation(SLUG, A, B, AT, editorCode);
      const invite = (await store.getEditorInvite(SLUG, B, AT))!;
      await store.acceptEditorInvitation(SLUG, B, AT, invite.inviteId);
      const next = await store.proposeGameTransfer({
        slug: SLUG,
        ownerUid: A,
        accessRevision: 2,
        expectedAccessVersion: 'v2',
        idempotencyKey: 'k2',
        at: AT,
      });
      expect(next).toMatchObject({ ok: true });
      if (!next.ok) throw new Error('unreachable');
      expect(next.proposal.proposalId).not.toBe(first.proposal.proposalId);
      const old = await store.getTransferProposalReceipt(A, 'k1', AT);
      expect(old.status).toBe('invalidated');
    });
  });
}
