// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { requestStateRestore, requestStateSnapshot } from './gamePlayer.js';

function makeFrame(): { frame: HTMLIFrameElement; posted: Array<Record<string, unknown>> } {
  const frame = document.createElement('iframe');
  const posted: Array<Record<string, unknown>> = [];
  Object.defineProperty(frame, 'contentWindow', {
    value: { postMessage: vi.fn((message: Record<string, unknown>) => posted.push(message)) },
  });
  return { frame, posted };
}

function replyFromGame(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { origin: 'null', data: { source: 'gdpl-player', ...data } }));
}

describe('requestStateSnapshot', () => {
  it('posts snapshotState and resolves with the reply data', async () => {
    const { frame, posted } = makeFrame();
    const pending = requestStateSnapshot(frame);
    expect(posted).toEqual([{ source: 'gdpl-host', type: 'snapshotState' }]);
    replyFromGame({ type: 'stateSnapshot', data: { score: 7 } });
    await expect(pending).resolves.toEqual({ score: 7 });
  });

  it('resolves null when the game has nothing to snapshot', async () => {
    const { frame } = makeFrame();
    const pending = requestStateSnapshot(frame);
    replyFromGame({ type: 'stateSnapshot', data: null });
    await expect(pending).resolves.toBeNull();
  });

  it('resolves null on a frame with no contentWindow', async () => {
    const frame = document.createElement('iframe');
    await expect(requestStateSnapshot(frame)).resolves.toBeNull();
  });

  it('resolves null after the timeout when the game never replies', async () => {
    vi.useFakeTimers();
    try {
      const { frame } = makeFrame();
      const pending = requestStateSnapshot(frame, 50);
      vi.advanceTimersByTime(50);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a reply of the wrong type or from a stale request', async () => {
    const { frame } = makeFrame();
    const pending = requestStateSnapshot(frame, 50);
    replyFromGame({ type: 'stateRestored', ok: true });
    replyFromGame({ source: 'other', type: 'stateSnapshot', data: { score: 1 } });
    replyFromGame({ type: 'stateSnapshot', data: { score: 2 } });
    await expect(pending).resolves.toEqual({ score: 2 });
  });
});

describe('requestStateRestore', () => {
  it('posts restoreState with the snapshot and resolves true on ok', async () => {
    const { frame, posted } = makeFrame();
    const pending = requestStateRestore(frame, { score: 7 });
    expect(posted).toEqual([{ source: 'gdpl-host', type: 'restoreState', data: { score: 7 } }]);
    replyFromGame({ type: 'stateRestored', ok: true });
    await expect(pending).resolves.toBe(true);
  });

  it('resolves false when the game declines the restore', async () => {
    const { frame } = makeFrame();
    const pending = requestStateRestore(frame, { score: 7 });
    replyFromGame({ type: 'stateRestored', ok: false });
    await expect(pending).resolves.toBe(false);
  });

  it('resolves false after the timeout when the frame has not booted yet', async () => {
    vi.useFakeTimers();
    try {
      const { frame } = makeFrame();
      const pending = requestStateRestore(frame, { score: 7 }, 50);
      vi.advanceTimersByTime(50);
      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
