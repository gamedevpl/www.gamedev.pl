import { describe, expect, it, vi } from 'vitest';
import { eraseAccount } from './erase-account.js';
import { DELETED_ACCOUNT_UID, InMemoryStore } from './store.js';
import { judgeShelfShadow } from '../creation/shelf-shadow.js';

async function verdict(store: InMemoryStore, ownerUid: string): Promise<string> {
  const [shelf, records, count] = await Promise.all([
    store.getShelf(ownerUid),
    store.listSubmissionsByOwner(ownerUid),
    store.countSubmissionsByOwner(ownerUid),
  ]);
  return judgeShelfShadow(shelf, records, count).verdict;
}

describe('eraseAccount and the shelf', () => {
  it('tombstones the erased owner shelf and rebuilds the one the rounds moved to', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:leaving', 'Theirs');
    await store.setSubmissionSlug(1, 'sky');
    const before = await store.getShelf('g:leaving');
    expect(before).not.toBeNull();

    await eraseAccount({ store, uid: 'g:leaving' });

    // A delete resets seq, and an in-flight rebuild wins with it.
    const after = await store.getShelf('g:leaving');
    expect(after?.stale).toBe(true);
    expect(after?.rounds).toEqual([]);
    expect(after?.seq ?? 0).toBeGreaterThan(before?.seq ?? 0);

    // Nothing personal survives the tombstone.
    expect(JSON.stringify(after)).not.toContain('Theirs');
    expect(JSON.stringify(after)).not.toContain('sky');

    // The round moved to the deleted-account uid.
    expect(await verdict(store, DELETED_ACCOUNT_UID)).toBe('match');
  });

  // Post-commit: identity gone, old shelf still servable.
  it('invalidates with the erasure fence, not after it', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:leaving', 'Theirs');
    await store.setSubmissionSlug(1, 'sky');
    const before = await store.getShelf('g:leaving');

    // The fence alone, which is erasure's first durable write.
    await store.beginAccountErasure('g:leaving', new Date().toISOString());

    const after = await store.getShelf('g:leaving');
    expect(after?.stale).toBe(true);
    expect(after?.seq ?? 0).toBeGreaterThan(before?.seq ?? 0);
  });

  // Erasure rewrites rounds without the mirror.
  it('invalidates collaborators on a game the erased account wrote on', async () => {
    const store = new InMemoryStore();
    const at = new Date().toISOString();
    await store.upsertUser({ uid: 'g:owner' });
    await store.upsertUser({ uid: 'g:leaving' });
    await store.ensureGameAccess('sky', 'g:owner', at, at);
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:leaving', 'Their round');
    await store.setSubmissionSlug(jobId, 'sky');

    await store.rebuildShelf('g:owner');
    const before = await store.getShelf('g:owner');
    expect(before?.stale).toBeUndefined();
    const ownedByOwner = await store.countSubmissionsByOwner('g:owner');

    await eraseAccount({ store, uid: 'g:leaving' });

    // The owner's count never moved; only this says so.
    expect(await store.countSubmissionsByOwner('g:owner')).toBe(ownedByOwner);
    expect((await store.getShelf('g:owner'))?.stale).toBe(true);
  });

  // The fence tombstones before the rows move, so source still holds them.
  it('refuses to rebuild an erased shelf while the rows are still there', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:leaving', 'Theirs');
    await store.setSubmissionSlug(1, 'sky');

    // Erasure has fenced and tombstoned, but has not rewritten the rounds yet.
    await store.beginAccountErasure('g:leaving', new Date().toISOString());
    expect((await store.getShelf('g:leaving'))?.stale).toBe(true);
    expect(await store.listSubmissionsByOwner('g:leaving')).toHaveLength(1);

    // A concurrent rebuild would otherwise make the pre-erasure shelf servable.
    expect(await store.rebuildShelf('g:leaving')).toBe(false);
    const after = await store.getShelf('g:leaving');
    expect(after?.stale).toBe(true);
    expect(after?.rounds).toEqual([]);
  });

  // The fence is kept, so a truthy check blocks forever.
  it('lets a uid that signed up again rebuild its shelf', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:leaving', 'Theirs');
    await store.setSubmissionSlug(1, 'sky');
    const erasedAt = new Date(Date.now() - 60_000).toISOString();
    await eraseAccount({ store, uid: 'g:leaving', at: erasedAt });
    expect((await store.getShelf('g:leaving'))?.stale).toBe(true);

    // Same uid, new account: dated after the fence.
    await store.upsertUser({ uid: 'g:leaving' });
    expect((await store.getUser('g:leaving'))!.createdAt > erasedAt).toBe(true);
    await store.createSubmission(2, 'g:leaving', 'Their new one');

    expect(await store.rebuildShelf('g:leaving')).toBe(true);
    const shelf = await store.getShelf('g:leaving');
    expect(shelf?.stale).toBeUndefined();
    expect(shelf?.rounds.map((round) => round.jobId)).toEqual([2]);
  });

  // Ten of these would fill the batch and starve live shelves.
  it('moves a refused erasure tombstone out of the stale window', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:leaving', 'Theirs');
    await store.beginAccountErasure('g:leaving', new Date().toISOString());
    const before = (await store.getShelf('g:leaving'))!;

    // The hourly pass picks it up and is refused.
    expect(await store.listStaleShelfOwners(new Date(Date.now() + 1000).toISOString(), 10)).toContain('g:leaving');
    expect(await store.rebuildShelf('g:leaving')).toBe(false);

    // A refusal writing nothing stays first in line.
    const after = (await store.getShelf('g:leaving'))!;
    expect(after.stale).toBe(true);
    expect(after.seq ?? 0).toBeGreaterThan(before.seq ?? 0);
  });

  // One member failing must not skip the others or the sink.
  it('keeps invalidating collaborators and rebuilds the sink after one failure', async () => {
    const store = new InMemoryStore();
    const at = new Date().toISOString();
    for (const uid of ['g:owner', 'g:editor', 'g:leaving']) await store.upsertUser({ uid });
    await store.ensureGameAccess('sky', 'g:owner', at, at);
    const invite = await store.createEditorInvitation('sky', 'g:owner', 'g:editor', at);
    await store.acceptEditorInvitation('sky', 'g:editor', at, (invite as { inviteId: string }).inviteId);
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:leaving', 'Their round');
    await store.setSubmissionSlug(jobId, 'sky');
    await store.rebuildShelf('g:owner');
    await store.rebuildShelf('g:editor');

    // The owner is iterated first, and fails.
    const real = store.tombstoneShelf.bind(store);
    vi.spyOn(store, 'tombstoneShelf').mockImplementation(async (uid, when) => {
      if (uid === 'g:owner') throw new Error('firestore is having a day');
      return real(uid, when);
    });

    await eraseAccount({ store, uid: 'g:leaving' });
    vi.restoreAllMocks();

    expect((await store.getShelf('g:editor'))?.stale).toBe(true);
    // No sink shelf before; a live one proves the rebuild ran.
    const sink = await store.getShelf(DELETED_ACCOUNT_UID);
    expect(sink).not.toBeNull();
    expect(sink?.stale).toBeUndefined();
  });

  it('leaves both shelves alone on a dry run', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:leaving', 'Theirs');

    await eraseAccount({ store, uid: 'g:leaving', dryRun: true });

    expect(await store.getShelf('g:leaving')).not.toBeNull();
    expect(await store.getShelf(DELETED_ACCOUNT_UID)).toBeNull();
  });
});
