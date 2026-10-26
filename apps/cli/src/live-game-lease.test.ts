import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { AGENT_PLAY_BRIDGE } from '@gamedevpl/contract';

const windows: JSDOM[] = [];
afterEach(() => {
  windows.splice(0).forEach((dom) => dom.window.close());
  vi.useRealTimers();
});

function fixture() {
  vi.useFakeTimers();
  const dom = new JSDOM('<canvas id="game" width="320" height="240"></canvas>', { runScripts: 'outside-only' });
  windows.push(dom);
  const win = dom.window;
  win.setTimeout = setTimeout as unknown as typeof win.setTimeout;
  win.clearTimeout = clearTimeout as unknown as typeof win.clearTimeout;
  win.requestAnimationFrame = (callback) => win.setTimeout(() => callback(0), 16);
  win.cancelAnimationFrame = (id) => win.clearTimeout(id);
  let paused = false;
  const replies: Array<Record<string, unknown>> = [];
  const held = new Set<string>();
  win.addEventListener('keydown', (e) => held.add(e.key));
  win.addEventListener('keyup', (e) => held.delete(e.key));
  const h = {
    frame: 37,
    metadata: { x: 12 },
    step: vi.fn(() => {
      h.frame++;
    }),
    audio: [],
  };
  Object.assign(win, {
    __GAME_HARNESS__: h,
    __GDPL_BRIDGE__: {
      post: (m: Record<string, unknown>) => replies.push(m),
      el: (id: string) => win.document.getElementById(id),
      text: () => '',
      setPaused: (value: boolean) => {
        paused = value;
      },
      capturePng: () => '',
      legendRows: () => [],
      kitRows: () => [],
      largestCanvas: () => win.document.querySelector('canvas'),
      isPaused: () => paused,
    },
  });
  win.eval(AGENT_PLAY_BRIDGE);
  const send = (type: string, data = {}) =>
    win.dispatchEvent(new win.MessageEvent('message', { source: win, data: { source: 'gdpl-host', type, ...data } }));
  return { send, h, held, replies, win, paused: () => paused };
}

it('observes without pausing and expires leased control with every held key released', async () => {
  const f = fixture();
  f.send('agent:observe', { id: 'look' });
  expect(f.paused()).toBe(false);
  expect(f.replies.at(-1)).toMatchObject({ id: 'look', frame: 37, snapshot: { x: 12 } });
  f.send('agent:enable', { id: 'take', lease: true });
  f.send('agent:command', { command: { kind: 'keyDown', key: 'ArrowRight' } });
  expect(f.held.has('ArrowRight')).toBe(true);
  expect(f.paused()).toBe(true);
  await vi.advanceTimersByTimeAsync(4000);
  f.send('agent:heartbeat');
  await vi.advanceTimersByTimeAsync(4000);
  expect(f.paused()).toBe(true);
  await vi.advanceTimersByTimeAsync(1001);
  expect(f.paused()).toBe(false);
  expect(f.held.size).toBe(0);
  expect(f.replies.at(-1)?.reason).toBe('lease expired');
});

it('reports a step exception as failure instead of claiming a completed movement', () => {
  const f = fixture();
  f.send('agent:enable', { lease: true });
  f.h.step.mockImplementation(() => {
    throw Error('collision failure');
  });
  f.send('agent:command', { id: 'move', command: { kind: 'press', key: 'ArrowRight', frames: 20 } });
  expect(f.replies.at(-1)).toMatchObject({ id: 'move', reason: 'error', frame: 37 });
  f.send('agent:disable', { id: 'release' });
  expect(f.held.size).toBe(0);
  expect(f.paused()).toBe(false);
});

it('normalizes command keys and supplies browser codes while respecting explicit codes', () => {
  const f = fixture();
  const events: Array<[string, string, string]> = [];
  for (const type of ['keydown', 'keyup'])
    f.win.addEventListener(type, (event) => {
      const key = event as KeyboardEvent;
      events.push([type, key.key, key.code]);
    });
  f.send('agent:enable', { lease: true });
  for (const [key, code] of [
    ['space', undefined],
    [' ', undefined],
    ['left', undefined],
    ['7', undefined],
    ['A', 'KeyQ'],
  ]) {
    f.send('agent:command', { command: { kind: 'tap', key, code } });
  }
  expect(events.filter(([type]) => type === 'keydown').map(([, key, code]) => [key, code])).toEqual([
    [' ', 'Space'],
    [' ', 'Space'],
    ['ArrowLeft', 'ArrowLeft'],
    ['7', 'Digit7'],
    ['A', 'KeyQ'],
  ]);
  expect(f.held.size).toBe(0);
});

it('does not expire the existing reviewer mode without an explicit local lease', async () => {
  const f = fixture();
  f.send('agent:enable');
  await vi.advanceTimersByTimeAsync(6000);
  expect(f.paused()).toBe(true);
  f.send('agent:disable');
  expect(f.paused()).toBe(false);
});

it('returns control even when game code breaks lifecycle notifications', async () => {
  const f = fixture();
  f.win.CustomEvent = function () {
    throw Error('broken event constructor');
  } as unknown as typeof f.win.CustomEvent;
  f.send('agent:enable', { lease: true });
  expect(f.paused()).toBe(true);
  await vi.advanceTimersByTimeAsync(5001);
  expect(f.paused()).toBe(false);
});

it('holds already scheduled rendering until release and preserves cancellation', async () => {
  const f = fixture();
  const paint = vi.fn(),
    cancelled = vi.fn();
  f.win.requestAnimationFrame(paint);
  const id = f.win.requestAnimationFrame(cancelled);
  f.send('agent:enable', { lease: true });
  await vi.advanceTimersByTimeAsync(100);
  expect(paint).not.toHaveBeenCalled();
  f.win.cancelAnimationFrame(id);
  f.send('agent:disable');
  await vi.advanceTimersByTimeAsync(100);
  expect(paint).toHaveBeenCalledTimes(1);
  expect(cancelled).not.toHaveBeenCalled();
});

it.each(['disable', 'expiry'])(
  'cancels remaining cooperative frames on %s, and refuses late leased commands',
  async (stop) => {
    const f = fixture();
    let clock = 0;
    vi.spyOn(f.win.performance, 'now').mockImplementation(() => (clock += 20));
    f.send('agent:enable', { lease: true });
    f.send('agent:command', {
      id: 'slow',
      leaseRequired: true,
      command: { kind: 'press', key: 'ArrowRight', frames: 300 },
    });
    expect(f.held.has('ArrowRight')).toBe(true);
    expect(f.h.frame).toBe(38);
    if (stop === 'disable') f.send('agent:disable');
    else {
      // Simulate a throttled tab: its heartbeat watchdog runs before its next chunk.
      const pending = [...f.replies];
      f.win.setTimeout = (() => 0) as unknown as typeof f.win.setTimeout;
      await vi.advanceTimersByTimeAsync(5001);
      expect(f.replies.length).toBeGreaterThan(pending.length);
    }
    const stoppedAt = f.h.frame;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.h.frame).toBe(stoppedAt);
    expect(f.held.size).toBe(0);
    expect(f.paused()).toBe(false);
    f.send('agent:command', { id: 'late', leaseRequired: true, command: { kind: 'step', frames: 20 } });
    expect(f.replies.at(-1)).toMatchObject({ id: 'late', reason: 'control unavailable' });
    expect(f.paused()).toBe(false);
    expect(f.h.frame).toBe(stoppedAt);
  },
);
