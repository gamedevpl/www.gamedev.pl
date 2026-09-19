// @vitest-environment jsdom
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { WORKBENCH_PLAYER_SCRIPT } from './workbench-player-script.js';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';
import { PHONE_PAGE } from './workbench-phone-page.js';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
function player(options: { reject?: boolean; unsupported?: boolean; safe?: boolean; notReady?: boolean } = {}) {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<iframe id="game" sandbox="allow-scripts allow-pointer-lock"></iframe>' +
    ['shown-build', 'empty', 'apply', 'restart', 'notice', 'record'].map((id) => `<div id="${id}"></div>`).join('');
  const previous = document.querySelector('iframe')!;
  const scores = new Map<HTMLIFrameElement, number>([[previous, 8]]);
  const events: Array<{ frame: HTMLIFrameElement; type: string }> = [];
  const context = {
    document,
    frame: previous,
    revision: 'old',
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn(),
    el: (id: string) => document.getElementById(id),
  };
  runInNewContext(WORKBENCH_PLAYER_SCRIPT, context);
  const runtime = context as typeof context & {
    swapBuild(build: { html: string; revision: string }, force?: boolean, automatic?: boolean): Promise<boolean>;
    gameRequest(frame: HTMLIFrameElement, type: string, data?: { score: number }): Promise<unknown>;
    posture(frame: HTMLIFrameElement, type: string): void;
  };
  runtime.posture = (frame, type) => {
    events.push({ frame, type });
  };
  runtime.gameRequest = async (frame, type, data) => {
    if (type === 'capabilities')
      return {
        ready: frame === previous || !options.notReady,
        state: !options.unsupported,
        validate: true,
        safe: options.safe ?? true,
      };
    if (type === 'snapshot') return { score: scores.get(frame) };
    if (type === 'restore') {
      if (options.reject) return false;
      scores.set(frame, data!.score);
      return true;
    }
    throw Error('Unexpected operation');
  };
  const build = { html: '<canvas></canvas>', revision: 'new' };
  return { runtime, previous, scores, events, build };
}
it('preserves state, keeps the old frame paused during readiness and commits only after restore', async () => {
  const { runtime, previous, scores, events, build } = player();
  const bridge = runtime.gameRequest;
  let ready!: () => void;
  runtime.gameRequest = async (frame, type, data) => {
    if (frame !== previous && type === 'capabilities')
      await new Promise<void>((resolve) => {
        ready = resolve;
      });
    return bridge(frame, type, data);
  };
  const swap = runtime.swapBuild(build);
  await vi.advanceTimersByTimeAsync(0);
  expect(previous.isConnected).toBe(true);
  expect(events).toContainEqual({ frame: previous, type: 'pause' });
  const candidate = document.querySelector('iframe:not(#game)')!;
  expect(candidate.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
  expect(candidate.getAttribute('sandbox')).not.toContain('allow-same-origin');
  ready();
  await vi.advanceTimersByTimeAsync(200);
  expect(await swap).toBe(true);
  expect(previous.isConnected).toBe(false);
  expect(runtime.frame).toBe(candidate);
  expect(runtime.revision).toBe('new');
  expect(scores.get(runtime.frame)).toBe(8);
});
it('discards a candidate that rejects state and resumes the original frame', async () => {
  const { runtime, previous, scores, events, build } = player({ reject: true });
  const swap = runtime.swapBuild(build);
  await vi.advanceTimersByTimeAsync(200);
  expect(await swap).toBe(false);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(runtime.frame).toBe(previous);
  expect(runtime.revision).toBe('old');
  expect(scores.get(previous)).toBe(8);
  expect(events.at(-1)).toEqual({ frame: previous, type: 'resume' });
  expect(document.getElementById('notice')!.textContent).toContain('Current build kept');
});
it('retains the original frame when the candidate never becomes ready', async () => {
  const { runtime, previous, events, build } = player({ notReady: true });
  const swap = runtime.swapBuild(build);
  await vi.advanceTimersByTimeAsync(4000);
  expect(await swap).toBe(false);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(runtime.frame).toBe(previous);
  expect(events.at(-1)).toEqual({ frame: previous, type: 'resume' });
});
it('requires explicit restart for unsupported state and waits for safe points in auto mode', async () => {
  const { runtime, previous, build } = player({ unsupported: true });
  expect(await runtime.swapBuild(build)).toBe(false);
  expect(previous.isConnected).toBe(true);
  const forced = runtime.swapBuild(build, true);
  await vi.advanceTimersByTimeAsync(200);
  expect(await forced).toBe(true);
  const unsafe = player({ safe: false });
  expect(await unsafe.runtime.swapBuild(build, false, true)).toBe(false);
  expect(unsafe.previous.isConnected).toBe(true);
});
it.each([
  ['desktop', SESSION_BROWSER_PAGE],
  ['phone', PHONE_PAGE],
])('%s shell uses the exact opaque game sandbox', (_name, html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const frames = [...doc.querySelectorAll('iframe')];
  expect(frames).toHaveLength(1);
  expect(frames[0]!.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
  expect(html).not.toContain('allow-same-origin');
  expect(WORKBENCH_PLAYER_SCRIPT).not.toContain('allow-same-origin');
});

it.each(['capabilities', 'snapshot', 'ready', 'restore'])(
  'a superseded update at %s cannot resume frames or overwrite the newer update',
  async (phase) => {
    const { runtime, previous, scores, events, build } = player();
    const bridge = runtime.gameRequest;
    let release!: () => void;
    let held = false;
    runtime.gameRequest = async (frame, type, data) => {
      const matches =
        phase === 'ready'
          ? frame !== previous && type === 'capabilities'
          : phase === 'capabilities'
            ? frame === previous && type === 'capabilities'
            : type === phase;
      if (!held && matches) {
        held = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return bridge(frame, type, data);
    };
    const stale = runtime.swapBuild(build);
    await vi.advanceTimersByTimeAsync(0);
    const staleCandidate = document.querySelector('iframe:not(#game)');
    const latest = runtime.swapBuild({ ...build, revision: 'latest' });
    await vi.advanceTimersByTimeAsync(0);
    document.getElementById('notice')!.textContent = 'New update in progress';
    document.getElementById('restart')!.hidden = true;
    const eventCount = events.length;
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await stale).toBe(false);
    expect(events).toHaveLength(eventCount);
    expect(staleCandidate?.isConnected ?? false).toBe(false);
    expect(document.getElementById('notice')!.textContent).toBe('New update in progress');
    expect(document.getElementById('restart')!.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(await latest).toBe(true);
    expect(runtime.revision).toBe('latest');
    expect(scores.get(runtime.frame)).toBe(8);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  },
);
it('an old readiness failure cannot overwrite an already committed update', async () => {
  const { runtime, previous, build } = player();
  const bridge = runtime.gameRequest;
  let release!: () => void;
  let held = false;
  runtime.gameRequest = async (frame, type, data) => {
    if (!held && frame !== previous && type === 'capabilities') {
      held = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      throw Error('Old bridge failed');
    }
    return bridge(frame, type, data);
  };
  const stale = runtime.swapBuild(build);
  await vi.advanceTimersByTimeAsync(0);
  const latest = runtime.swapBuild({ ...build, revision: 'latest' });
  await vi.advanceTimersByTimeAsync(200);
  expect(await latest).toBe(true);
  const notice = document.getElementById('notice')!.textContent;
  release();
  await vi.advanceTimersByTimeAsync(200);
  expect(await stale).toBe(false);
  expect(document.getElementById('notice')!.textContent).toBe(notice);
  expect(document.getElementById('restart')!.hidden).toBe(true);
  expect(runtime.revision).toBe('latest');
});

it('source invalidation while waiting for readiness leaves the new source UI untouched', async () => {
  const { runtime, previous, events, build } = player();
  const bridge = runtime.gameRequest;
  let release!: () => void;
  runtime.gameRequest = async (frame, type, data) => {
    if (frame !== previous && type === 'capabilities')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return bridge(frame, type, data);
  };
  const stale = runtime.swapBuild(build);
  await vi.advanceTimersByTimeAsync(0);
  runInNewContext("swapEpoch++;revision='';frame.removeAttribute('srcdoc');", runtime);
  document.getElementById('notice')!.textContent = 'Loading another game';
  document.getElementById('restart')!.hidden = true;
  const eventCount = events.length;
  release();
  await vi.advanceTimersByTimeAsync(200);
  expect(await stale).toBe(false);
  expect(events).toHaveLength(eventCount);
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
  expect(runtime.revision).toBe('');
  expect(document.getElementById('notice')!.textContent).toBe('Loading another game');
  expect(document.getElementById('restart')!.hidden).toBe(true);
});
