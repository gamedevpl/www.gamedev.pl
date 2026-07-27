import { beforeEach, describe, expect, it } from 'vitest';
import { erasePlayerSignals, indexHint } from './erase-player-signals.js';
import { InMemoryStore } from './store.js';

describe('indexHint', () => {
  // Verbatim from a real run against the live project, moments after setup-gcp.sh created
  // the index — the case the operator actually hits, so the one worth pinning.
  const stillBuilding =
    '9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection ' +
    'playerFeedback and field uid. That index is not ready yet. See its status here: ' +
    'https://console.firebase.google.com/v1/r/project/gamedevpl/firestore/indexes?create_exemption=Cl';

  const neverCreated =
    '9 FAILED_PRECONDITION: no matching index found for collection playerFeedback and field uid.';

  it('tells an operator to wait, not to re-run setup, while the index builds', () => {
    const hint = indexHint(stillBuilding);

    expect(hint).toContain('still building');
    expect(hint).toContain('Wait a minute');
    // The load-bearing half: re-running setup reports the index as present, which reads as
    // the fix having failed and invites the operator to give up on the tool.
    expect(hint).toContain('will not help');
  });

  it('tells an operator to run setup when the index was never created', () => {
    const hint = indexHint(neverCreated);

    expect(hint).toContain('setup-gcp.sh');
    expect(hint).not.toContain('still building');
  });

  it('stays out of the way of unrelated failures', () => {
    // A permissions error or a network fault must be shown as itself. Guessing "index"
    // here would send an operator to fix something that was never wrong.
    expect(indexHint('7 PERMISSION_DENIED: Missing or insufficient permissions.')).toBeNull();
    expect(indexHint('Error: getaddrinfo ENOTFOUND firestore.googleapis.com')).toBeNull();
  });

  it('does not claim an index error belonging to some other query', () => {
    // This command depends on exactly one index. An index failure naming a different
    // collection is a real failure the operator must read, and answering it with
    // "provision playerFeedback.uid" sends them to fix something already fine.
    expect(
      indexHint('9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_DESC index for collection scorecard and field computedAt.'),
    ).toBeNull();
  });
});

/**
 * This is the executable half of a promise the privacy notice makes, so the tests are
 * about the promise rather than the plumbing: everything of this person's goes, nothing
 * of anyone else's does, and the aggregate counts other people see stay honest
 * afterwards.
 */

describe('erasePlayerSignals', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:leaver' });
    await store.upsertUser({ uid: 'g:stayer' });

    await store.castVote('brick-storm', 'g:leaver', 'up');
    await store.castVote('brick-storm', 'g:stayer', 'up');
    await store.castVote('rock-blaster', 'g:leaver', 'down');

    await store.addPlayerFeedback('brick-storm', 'g:leaver', 'level two is a wall');
    await store.addPlayerFeedback('brick-storm', 'g:stayer', 'the controls feel great');
    await store.addPlayerFeedback('rock-blaster', 'g:leaver', 'asteroids spawn on top of me');
  });

  it('removes the leaver’s votes and feedback across every game', async () => {
    const result = await erasePlayerSignals({ store, uid: 'g:leaver' });

    expect(result.votesCleared.sort()).toEqual(['brick-storm', 'rock-blaster']);
    expect(result.feedbackDeleted).toBe(2);

    expect(await store.getVote('brick-storm', 'g:leaver')).toBeNull();
    expect(await store.getVote('rock-blaster', 'g:leaver')).toBeNull();
    expect((await store.listPlayerFeedback('brick-storm')).map((row) => row.uid)).toEqual(['g:stayer']);
    expect(await store.listPlayerFeedback('rock-blaster')).toEqual([]);
  });

  it('leaves everyone else’s signals untouched', async () => {
    await erasePlayerSignals({ store, uid: 'g:leaver' });

    expect(await store.getVote('brick-storm', 'g:stayer')).toBe('up');
    expect((await store.listPlayerFeedback('brick-storm'))[0]?.text).toContain('controls feel great');
  });

  it('keeps the public vote tallies honest after the erase', async () => {
    // The property most easily lost: votes are counted on the parent game document, so
    // deleting a vote row directly would leave the count overstating reality forever —
    // a number every visitor sees, wrong, with nothing to notice it.
    expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 2, down: 0 });

    await erasePlayerSignals({ store, uid: 'g:leaver' });

    expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 1, down: 0 });
    expect(await store.getVoteCounts('rock-blaster')).toEqual({ up: 0, down: 0 });
  });

  it('reports what it would do without touching anything on a dry run', async () => {
    const result = await erasePlayerSignals({ store, uid: 'g:leaver', dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.votesCleared.sort()).toEqual(['brick-storm', 'rock-blaster']);
    expect(result.feedbackDeleted).toBe(2);

    // Still all there.
    expect(await store.getVote('brick-storm', 'g:leaver')).toBe('up');
    expect(await store.listPlayerFeedback('rock-blaster')).toHaveLength(1);
    expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 2, down: 0 });
  });

  it('is a no-op for an account that never voted or wrote anything', async () => {
    const result = await erasePlayerSignals({ store, uid: 'g:ghost' });

    expect(result.votesCleared).toEqual([]);
    expect(result.feedbackDeleted).toBe(0);
    // And nobody else was disturbed by the attempt.
    expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 2, down: 0 });
  });

  it('previews exactly what it then deletes', async () => {
    // The dry run is the only thing between an operator and an irreversible delete, so
    // the two must agree by construction rather than by coincidence — they run the same
    // query, and this is the assertion that keeps them running the same query.
    const preview = await erasePlayerSignals({ store, uid: 'g:leaver', dryRun: true });
    const actual = await erasePlayerSignals({ store, uid: 'g:leaver' });

    expect(actual.feedbackDeleted).toBe(preview.feedbackDeleted);
    expect(actual.votesCleared).toEqual(preview.votesCleared);
  });

  it('writes nothing when the feedback query fails', async () => {
    // The CLI tells an operator "nothing was erased" when it hits the index error, and
    // that has to be true, not hopeful. Feedback is the only step needing an index, so it
    // runs before any vote is cleared. If someone reorders it, this fails: the erase would
    // wipe every vote and then report that nothing happened.
    const boom = new Error(
      '9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection ' +
        'playerFeedback and field uid. That index is not ready yet.',
    );
    store.deletePlayerFeedbackByUid = () => Promise.reject(boom);

    await expect(erasePlayerSignals({ store, uid: 'g:leaver' })).rejects.toThrow('FAILED_PRECONDITION');

    expect(await store.getVote('brick-storm', 'g:leaver')).toBe('up');
    expect(await store.getVote('rock-blaster', 'g:leaver')).toBe('down');
    expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 2, down: 0 });
  });

  it('is idempotent — a second run finds nothing left', async () => {
    await erasePlayerSignals({ store, uid: 'g:leaver' });
    const second = await erasePlayerSignals({ store, uid: 'g:leaver' });

    expect(second.votesCleared).toEqual([]);
    expect(second.feedbackDeleted).toBe(0);
    // The first run's correction is not applied twice.
    expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 1, down: 0 });
  });
});
