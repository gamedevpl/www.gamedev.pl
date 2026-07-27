import { beforeEach, describe, expect, it } from 'vitest';
import { erasePlayerSignals } from './erase-player-signals.js';
import { InMemoryStore } from './store.js';

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

  it('is idempotent — a second run finds nothing left', async () => {
    await erasePlayerSignals({ store, uid: 'g:leaver' });
    const second = await erasePlayerSignals({ store, uid: 'g:leaver' });

    expect(second.votesCleared).toEqual([]);
    expect(second.feedbackDeleted).toBe(0);
    // The first run's correction is not applied twice.
    expect(await store.getVoteCounts('brick-storm')).toEqual({ up: 1, down: 0 });
  });
});
