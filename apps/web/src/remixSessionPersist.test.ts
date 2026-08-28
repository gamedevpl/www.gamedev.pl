// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remixApi = vi.hoisted(() => ({ getRemix: vi.fn() }));
vi.mock('./remixApi', () => remixApi);

import {
  chatTurnsFromServer,
  clearRemixSnapshot,
  readRemixSnapshot,
  resumeRemixForSlug,
  stashPending,
  takePending,
  writeRemixSnapshot,
} from './remixSessionPersist.js';

function liveSnap() {
  return {
    v: 1 as const,
    slug: 'dog-dash',
    remixId: 'r1',
    expiresAt: Date.now() + 60_000,
    remixOpen: true,
    chatExpanded: false,
    values: { speed: 2 },
    chatTurns: [{ id: '1', role: 'user' as const, text: 'faster' }],
    changed: { text: 'Faster.', canShare: true },
    note: null,
    successCount: 1,
    asked: 'faster',
    utterance: '',
  };
}

describe('remixSessionPersist', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearRemixSnapshot();
    remixApi.getRemix.mockReset();
  });

  afterEach(() => {
    clearRemixSnapshot();
    window.sessionStorage.clear();
  });

  it('scopes the pending request to the game it was typed on', () => {
    stashPending('dog-dash', 'faster');
    expect(takePending('other-game')).toBeNull();
    stashPending('dog-dash', 'faster');
    expect(takePending('dog-dash')).toBe('faster');
    expect(takePending('dog-dash')).toBeNull();
  });

  it('round-trips a live remix snapshot for the same slug', () => {
    writeRemixSnapshot(liveSnap());
    expect(readRemixSnapshot('other-game')).toBeNull();
    const snap = readRemixSnapshot('dog-dash');
    expect(snap?.remixId).toBe('r1');
    expect(snap?.values).toEqual({ speed: 2 });
    expect(snap?.chatExpanded).toBe(false);
  });

  it('drops an expired snapshot', () => {
    writeRemixSnapshot({
      ...liveSnap(),
      expiresAt: Date.now() - 1,
      values: {},
      chatTurns: [],
      changed: null,
      successCount: 0,
      asked: '',
      chatExpanded: true,
    });
    expect(readRemixSnapshot('dog-dash')).toBeNull();
  });

  it('rebuilds chat turns from the server history', () => {
    expect(chatTurnsFromServer([{ utterance: 'faster', summary: 'Raised speed.' }])).toEqual([
      { id: 's-0-u', role: 'user', text: 'faster' },
      { id: 's-0-a', role: 'assistant', text: 'Raised speed.' },
    ]);
  });

  it('resumes the server session for a live snapshot', async () => {
    writeRemixSnapshot(liveSnap());
    remixApi.getRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: { speed: 2 },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 60_000,
      html: '<html></html>',
      undoable: true,
    });
    const resumed = await resumeRemixForSlug('dog-dash');
    expect(remixApi.getRemix).toHaveBeenCalledWith('r1');
    expect(resumed?.live.html).toBe('<html></html>');
    expect(resumed?.snapshot.values).toEqual({ speed: 2 });
  });

  it('clears the snapshot when resume fails', async () => {
    writeRemixSnapshot(liveSnap());
    remixApi.getRemix.mockRejectedValue(new Error('expired'));
    expect(await resumeRemixForSlug('dog-dash')).toBeNull();
    expect(readRemixSnapshot('dog-dash')).toBeNull();
  });
});
