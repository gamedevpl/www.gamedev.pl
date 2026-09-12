import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { AFFINITY_WINDOW_MS, invalidatePlayAffinity, readPlayAffinityCached } from './affinity-cache.js';

async function playerWith(slugs: string[]) {
  const store = new InMemoryStore();
  for (const slug of slugs) await store.recordPlayAffinity('g:player', slug);
  return store;
}

describe('play affinity window', () => {
  it('reads a player once per window, not once per home load', async () => {
    let clock = 1_700_000_000_000;
    const store = await playerWith(['airtime', 'sky-dodge', 'unicorn-snap']);
    const listed = vi.spyOn(store, 'listPlayAffinity');

    for (let load = 0; load < 5; load += 1) {
      const rows = await readPlayAffinityCached(store, 'g:player', () => clock);
      expect(rows).toHaveLength(3);
      clock += 10_000;
    }
    expect(listed).toHaveBeenCalledTimes(1);
  });

  it('reads again once the window lapses', async () => {
    let clock = 1_700_000_000_000;
    const store = await playerWith(['airtime']);
    const listed = vi.spyOn(store, 'listPlayAffinity');

    await readPlayAffinityCached(store, 'g:player', () => clock);
    clock += AFFINITY_WINDOW_MS;
    await readPlayAffinityCached(store, 'g:player', () => clock);
    expect(listed).toHaveBeenCalledTimes(2);
  });

  it('never answers one player with another player rows', async () => {
    const clock = () => 1_700_000_000_000;
    const store = await playerWith(['airtime']);
    await store.recordPlayAffinity('g:other', 'sky-dodge');

    const mine = await readPlayAffinityCached(store, 'g:player', clock);
    const theirs = await readPlayAffinityCached(store, 'g:other', clock);
    expect(mine.map((row) => row.slug)).toEqual(['airtime']);
    expect(theirs.map((row) => row.slug)).toEqual(['sky-dodge']);
  });

  it('shows a game the moment it is played, not a window later', async () => {
    const clock = () => 1_700_000_000_000;
    const store = await playerWith(['airtime']);
    await readPlayAffinityCached(store, 'g:player', clock);

    await store.recordPlayAffinity('g:player', 'sky-dodge');
    invalidatePlayAffinity(store, 'g:player');

    const rows = await readPlayAffinityCached(store, 'g:player', clock);
    expect(rows.map((row) => row.slug).sort()).toEqual(['airtime', 'sky-dodge']);
  });

  it('does not seal in rows a play wrote during the read', async () => {
    const clock = () => 1_700_000_000_000;
    const store = await playerWith(['airtime']);
    vi.spyOn(store, 'listPlayAffinity').mockImplementation(async () => {
      invalidatePlayAffinity(store, 'g:player');
      return [{ slug: 'airtime', openCount: 1, lastPlayedAt: new Date(1_700_000_000_000).toISOString() }];
    });

    await readPlayAffinityCached(store, 'g:player', clock);
    vi.restoreAllMocks();
    const listed = vi.spyOn(store, 'listPlayAffinity');
    await readPlayAffinityCached(store, 'g:player', clock);
    expect(listed).toHaveBeenCalledTimes(1);
  });

  it('bounds how many players it remembers', async () => {
    const clock = () => 1_700_000_000_000;
    const store = new InMemoryStore();
    const listed = vi.spyOn(store, 'listPlayAffinity');
    for (let i = 0; i < 600; i += 1) await readPlayAffinityCached(store, `g:p${i}`, clock);
    await readPlayAffinityCached(store, 'g:p0', clock);
    expect(listed.mock.calls.length).toBe(601);
  });
});
