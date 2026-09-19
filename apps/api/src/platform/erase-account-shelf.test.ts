import { describe, expect, it } from 'vitest';
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

  it('leaves both shelves alone on a dry run', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, 'g:leaving', 'Theirs');

    await eraseAccount({ store, uid: 'g:leaving', dryRun: true });

    expect(await store.getShelf('g:leaving')).not.toBeNull();
    expect(await store.getShelf(DELETED_ACCOUNT_UID)).toBeNull();
  });
});
