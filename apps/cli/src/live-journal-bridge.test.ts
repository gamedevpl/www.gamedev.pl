import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { LIVE_JOURNAL_BRIDGE } from './live-journal-bridge.js';
import type { JournalEntry } from './live-journal-protocol.js';
import { AGENT_PLAY_BRIDGE } from '@gamedevpl/contract';

const windows: JSDOM[] = [];

it('seals old code queues and samples a paused replacement under a linked new recording', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  const initial = f.messages.at(-1)!;
  const hook = (
    f.win as unknown as {
      __GAME_JOURNAL_HOT__: {
        begin(input: object): void;
        finish(result: object): { recordingId: string; previousRecordingId: string };
      };
    }
  ).__GAME_JOURNAL_HOT__;
  hook.begin({
    id: 'transition',
    previousRevision: 'A',
    revision: 'B',
    expectedEpoch: 0,
    stateVersion: 1,
    observationVersion: 1,
  });
  f.h.metadata.x = 99;
  const next = hook.finish({ status: 'applied', epoch: 1, ready: true, frame: 0, simulationTick: 0 });
  expect(next.previousRecordingId).toBe(initial.recordingId);
  expect(next.recordingId).not.toBe(initial.recordingId);
  await vi.advanceTimersByTimeAsync(250);
  const old = f.messages.filter((m) => m.recordingId === initial.recordingId).at(-1)!;
  const current = f.messages.filter((m) => m.recordingId === next.recordingId).at(-1)!;
  expect(
    JSON.parse(old.json).some(
      (e: JournalEntry) => e.kind === 'state' && (e.data as { metadata: { x: number } }).metadata.x === 99,
    ),
  ).toBe(false);
  expect(JSON.parse(current.json).find((e: JournalEntry) => e.kind === 'state').data.metadata.x).toBe(99);
  expect(current).toMatchObject({
    revision: 'B',
    segment: { buildEpoch: 1, previousRecordingId: initial.recordingId },
  });
  f.send({ source: 'gdpl-journal-host', recordingId: initial.recordingId, through: JSON.parse(old.json).at(-1).seq });
  f.h.frame++;
  f.h.step();
  await vi.advanceTimersByTimeAsync(250);
  expect(f.messages.at(-1)!.recordingId).toBe(next.recordingId);
});
afterEach(() => {
  windows.splice(0).forEach((dom) => dom.window.close());
  vi.useRealTimers();
});
function fixture() {
  vi.useFakeTimers();
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  windows.push(dom);
  const win = dom.window;
  let clock = 0,
    nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const messages: Array<{ recordingId: string; json: string }> = [];
  const h = {
    ready: true,
    frame: 0,
    metadata: { x: 4 },
    signals: [] as object[],
    audio: [] as object[],
    step() {
      h.frame++;
      h.metadata.x++;
    },
    snapshotState: vi.fn((): unknown => ({ player: { x: h.metadata.x } })),
  };
  win.setInterval = setInterval as unknown as typeof win.setInterval;
  win.performance.now = () => clock;
  win.requestAnimationFrame = (callback) => {
    frames.set(++nextId, callback);
    return nextId;
  };
  win.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  win.postMessage = (message: unknown) => {
    messages.push(message as (typeof messages)[number]);
  };
  Object.assign(win, { __GAME_HARNESS__: h });
  win.eval(LIVE_JOURNAL_BRIDGE);
  win.dispatchEvent(new win.Event('DOMContentLoaded'));
  const send = (data: object) => win.dispatchEvent(new win.MessageEvent('message', { source: win, data }));
  return {
    win,
    h,
    frames,
    messages,
    send,
    advance(ms: number) {
      clock += ms;
    },
    async flush() {
      await vi.advanceTimersByTimeAsync(250);
      const batch = messages.at(-1)!;
      const entries = JSON.parse(batch.json) as JournalEntry[];
      send({ source: 'gdpl-journal-host', recordingId: batch.recordingId, through: entries.at(-1)!.seq });
      return entries;
    },
  };
}

it('freezes initial and stepped states, inputs and console values before later mutation', async () => {
  const f = fixture();
  f.win.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', ctrlKey: true }));
  f.h.step();
  const details = { value: 5 };
  f.win.console.warn('sample', details);
  details.value = 999;
  f.h.metadata.x = 999;
  const entries = await f.flush();
  expect(entries.filter((entry) => entry.kind === 'state').map((entry) => entry.data)).toMatchObject([
    { metadata: { x: 4 }, persistedState: { player: { x: 4 } }, stateStatus: 'available' },
    { metadata: { x: 5 }, heldKeys: ['ArrowRight'] },
  ]);
  expect(entries.find((entry) => entry.kind === 'input')?.data).toMatchObject({
    actor: 'synthetic',
    ctrl: true,
    code: 'ArrowRight',
  });
  expect(entries.find((entry) => entry.kind === 'console')?.data).toMatchObject({ args: ['sample', { value: 5 }] });
});

it('samples native callbacks after updates and preserves RAF cancellation', async () => {
  const f = fixture();
  const cancelled = vi.fn();
  f.win.cancelAnimationFrame(f.win.requestAnimationFrame(cancelled));
  f.win.requestAnimationFrame(() => {
    f.h.frame++;
    f.h.metadata.x = 8;
  });
  for (const callback of f.frames.values()) callback(0);
  const entries = await f.flush();
  expect(cancelled).not.toHaveBeenCalled();
  expect(entries.filter((entry) => entry.kind === 'state').at(-1)).toMatchObject({
    frame: 1,
    data: { metadata: { x: 8 } },
  });
});

it('reports slow, missing and unserializable snapshots without breaking the game', async () => {
  const f = fixture();
  f.h.snapshotState.mockImplementationOnce(() => {
    f.advance(5);
    return { x: 1 };
  });
  f.h.step();
  f.h.step();
  f.advance(101);
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  f.h.snapshotState.mockReturnValueOnce(cyclic);
  expect(() => f.h.step()).not.toThrow();
  const entries = await f.flush();
  const reasons = entries
    .filter((entry) => entry.kind === 'gap')
    .map((entry) => (entry.data as { reason: string }).reason);
  expect(reasons).toContain('State sampling exceeded 4 ms; cooling down for 100 ms');
  expect(reasons).toContain('Unsampled frames');
  expect(reasons).toContain('State serialization failed');
});

it('records signal entries without sequence numbers and coalesced audio updates', async () => {
  const f = fixture();
  f.h.signals.push({ type: 'progress', name: 'checkpoint', frame: 0 });
  const audio = { type: 'sfx', name: 'jump', seq: 1, count: 1, frame: 0 };
  f.h.audio.push(audio);
  const first = await f.flush();
  expect(first.filter((entry) => entry.kind === 'signal')).toHaveLength(1);
  expect(first.filter((entry) => entry.kind === 'audio')).toHaveLength(1);
  audio.count = 3;
  const second = await f.flush();
  expect(second.filter((entry) => entry.kind === 'audio')[0]?.data).toMatchObject({ count: 3 });
  expect(second.filter((entry) => entry.kind === 'signal')).toHaveLength(0);
});

it('attributes agent cleanup before release, including watchdog expiry', async () => {
  const f = fixture();
  Object.assign(f.win, {
    __GDPL_BRIDGE__: {
      post: () => {},
      el: () => null,
      text: () => '',
      setPaused: () => {},
      capturePng: () => '',
      legendRows: () => [],
      kitRows: () => [],
      largestCanvas: () => null,
      isPaused: () => true,
    },
  });
  f.win.setTimeout = setTimeout as unknown as typeof f.win.setTimeout;
  f.win.clearTimeout = clearTimeout as unknown as typeof f.win.clearTimeout;
  f.win.eval(AGENT_PLAY_BRIDGE);
  for (const expire of [false, true]) {
    f.send({ source: 'gdpl-host', type: 'agent:enable', lease: true });
    f.send({ source: 'gdpl-host', type: 'agent:command', command: { kind: 'keyDown', key: 'space' } });
    if (expire) await vi.advanceTimersByTimeAsync(5001);
    else f.send({ source: 'gdpl-host', type: 'agent:disable' });
    const entries = await f.flush();
    const release = entries.findIndex(
      (entry) => entry.kind === 'lifecycle' && (entry.data as { event: string }).event === 'release-control',
    );
    const up = entries.findIndex(
      (entry) => entry.kind === 'input' && (entry.data as { type: string }).type === 'keyup',
    );
    expect(up).toBeGreaterThanOrEqual(0);
    expect(release).toBeGreaterThan(up);
    expect(entries[up]?.data).toMatchObject({ actor: 'agent', cleanup: true, key: ' ', code: 'Space' });
  }
});

it('records step failures without swallowing the exception or calling arbitrary helpers', async () => {
  const f = fixture();
  f.h.step = () => {
    throw Error('collision failed');
  };
  f.send({ source: 'gdpl-host', type: 'agent:enable' });
  expect(() => f.h.step()).toThrow('collision failed');
  expect((await f.flush()).find((entry) => entry.kind === 'error')?.data).toMatchObject({
    phase: 'step',
    message: 'Error: collision failed',
  });
});

it('bounds the disconnected buffer and reports discarded events after acknowledgement', async () => {
  const f = fixture();
  for (let i = 0; i < 5000; i++) f.win.dispatchEvent(new f.win.KeyboardEvent('keyup', { key: 'j' }));
  const entries: JournalEntry[] = [];
  for (let i = 0; i < 18; i++) entries.push(...(await f.flush()));
  expect(
    entries.some(
      (entry) => entry.kind === 'gap' && (entry.data as { reason: string }).reason.includes('buffer overflow'),
    ),
  ).toBe(true);
});
