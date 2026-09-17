// The mirror has to hold the games a creator owns now.

import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { loadShelfRecords } from './studio-shelf-records.js';
import { collapseJobsToOwnerGames } from './owner-games.js';
import { fromShelfRound } from '../store/records/shelf.js';

const token = (jobId: number) => `token-${jobId}`;

async function transferredGame(store: InMemoryStore): Promise<number> {
  const at = new Date().toISOString();
  await store.upsertUser({ uid: 'g:ada' });
  await store.upsertUser({ uid: 'g:grace' });
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
  await store.setSubmissionSlug(jobId, 'sky-dodge');
  await store.setSubmissionDeliveredVersion(jobId, 'v1');
  await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);

  const later = new Date(Date.now() + 1000).toISOString();
  const code = (await store.ensureRecipientCode('g:grace', later))!;
  const revision = (await store.getGameAccess('sky-dodge'))!.accessRevision;
  await store.createGameTransferInvitation('sky-dodge', 'g:ada', 'g:grace', revision, later, code);
  const invite = (await store.getActiveGameTransfer('sky-dodge', later))!;
  await store.acceptGameTransferInvitation('sky-dodge', 'g:grace', later, invite.invitationId);
  return jobId;
}

describe('the shelf mirror after a handover', () => {
  it('mirrors the game the recipient now owns', async () => {
    const store = new InMemoryStore();
    const jobId = await transferredGame(store);

    // What the shelf route answers with today.
    const source = await loadShelfRecords(store, 'g:grace', undefined, token);
    expect(source.map((record) => record.jobId)).toEqual([jobId]);

    expect(await store.rebuildShelf('g:grace')).toBe(true);
    const shelf = await store.getShelf('g:grace');
    expect(shelf?.rounds.map((round) => round.jobId)).toEqual([jobId]);
  });

  it('drops the game the sender no longer owns', async () => {
    const store = new InMemoryStore();
    await transferredGame(store);

    expect(await store.rebuildShelf('g:ada')).toBe(true);
    const shelf = await store.getShelf('g:ada');
    expect(shelf?.rounds ?? []).toEqual([]);
  });

  it('keeps the transferred game when recipient abandons their own newer round', async () => {
    const store = new InMemoryStore();
    const jobId = await transferredGame(store);

    // Recipient starts a new round under their own uid and abandons it.
    const round2 = await store.allocateJobId();
    await store.createSubmission(round2, 'g:grace', 'Sky Dodge (draft)');
    await store.setSubmissionSlug(round2, 'sky-dodge');
    await store.setSubmissionAbandoned(round2, new Date().toISOString());

    // Direct route still has the sender's live round.
    const source = await loadShelfRecords(store, 'g:grace', undefined, token);
    expect(source.map((record) => record.jobId)).toContain(jobId);

    // Mirrored shelf must keep the sender's live round.
    expect(await store.rebuildShelf('g:grace')).toBe(true);
    const shelf = await store.getShelf('g:grace');
    expect(shelf?.rounds.map((round) => round.jobId)).toContain(jobId);

    const mirroredRecords = (shelf?.rounds ?? []).map(fromShelfRound);
    const collapsed = collapseJobsToOwnerGames(mirroredRecords, 'shelf');
    expect(collapsed.map((entry) => entry.tip.jobId)).toEqual([jobId]);
  });

  it('retains earlier owner rounds when recipient adds their own round', async () => {
    const store = new InMemoryStore();
    const jobId1 = await transferredGame(store);

    const jobId2 = await store.allocateJobId();
    await store.createSubmission(jobId2, 'g:grace', 'Sky Dodge (update)');
    await store.setSubmissionSlug(jobId2, 'sky-dodge');

    expect(await store.rebuildShelf('g:grace')).toBe(true);
    const shelf = await store.getShelf('g:grace');
    const jobIds = shelf?.rounds.map((round) => round.jobId) ?? [];
    expect(jobIds).toContain(jobId1);
    expect(jobIds).toContain(jobId2);

    const direct = await loadShelfRecords(store, 'g:grace', undefined, token);
    const directJobIds = direct.map((record) => record.jobId);
    expect(directJobIds).toContain(jobId1);
    expect(directJobIds).toContain(jobId2);
  });

  it('retains intervening rounds when ownership boomerangs back', async () => {
    const store = new InMemoryStore();
    const jobId1 = await transferredGame(store);

    const jobId2 = await store.allocateJobId();
    await store.createSubmission(jobId2, 'g:grace', 'Sky Dodge (grace round)');
    await store.setSubmissionSlug(jobId2, 'sky-dodge');

    const at2 = new Date(Date.now() + 2000).toISOString();
    const code = (await store.ensureRecipientCode('g:ada', at2))!;
    const rev = (await store.getGameAccess('sky-dodge'))!.accessRevision;
    await store.createGameTransferInvitation('sky-dodge', 'g:grace', 'g:ada', rev, at2, code);
    const invite2 = (await store.getActiveGameTransfer('sky-dodge', at2))!;
    await store.acceptGameTransferInvitation('sky-dodge', 'g:ada', at2, invite2.invitationId);

    expect(await store.rebuildShelf('g:ada')).toBe(true);
    const shelfAda = await store.getShelf('g:ada');
    const adaJobIds = shelfAda?.rounds.map((round) => round.jobId) ?? [];
    expect(adaJobIds).toContain(jobId1);
    expect(adaJobIds).toContain(jobId2);

    expect(await store.rebuildShelf('g:grace')).toBe(true);
    const shelfGrace = await store.getShelf('g:grace');
    expect(shelfGrace?.rounds ?? []).toEqual([]);
  });

  it('counts canonical reconciled rounds for transfer recipient and sender', async () => {
    const store = new InMemoryStore();
    await transferredGame(store);

    expect(await store.countSubmissionsByOwner('g:grace')).toBe(1);
    expect(await store.countSubmissionsByOwner('g:ada')).toBe(0);
  });
});
