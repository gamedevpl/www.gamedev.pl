// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { WORKBENCH_PLAYER_SCRIPT } from './workbench-player-script.js';

afterEach(() => document.body.replaceChildren());

function player(options: { ready?: boolean; rejection?: boolean; lostReply?: boolean } = {}) {
  document.body.innerHTML =
    '<iframe></iframe><div id="shown-build"></div><div id="apply"></div><div id="restart"></div><div id="notice"></div>';
  const requests: string[] = [];
  const context = {
    document,
    crypto: webcrypto,
    TextEncoder,
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn(),
    frame: document.querySelector('iframe'),
    revision: 'A',
    sourceId: 1,
    liveOperation: false,
    liveEpoch: 0,
    hotUpdating: false,
    hotUnavailable: false,
    liveHello: vi.fn(),
    el: (id: string) => document.getElementById(id),
    liveHotUpdate: vi.fn(async (message: { phase: string }) => ({
      state: message.phase === 'abort' ? 'aborted' : 'prepared',
    })),
  };
  runInNewContext(WORKBENCH_PLAYER_SCRIPT, context);
  const runtime = context as typeof context & {
    hotBuild(build: object, check: () => void): Promise<boolean>;
    gameRequest(frame: HTMLIFrameElement, type: string): Promise<unknown>;
  };
  runtime.gameRequest = async (_frame, type) => {
    requests.push(type);
    if (type === 'hot:status') return { bootHash: 'boot', epoch: 0, ready: options.ready ?? true };
    if (type === 'hot:apply') {
      if (options.rejection) throw Object.assign(Error('Runtime became unavailable'), { definitive: true });
      throw Error('Reply lost');
    }
    if (type === 'hot:result' && options.lostReply) return null;
    throw Error('Unexpected operation');
  };
  const build = {
    revision: 'B',
    hot: {
      bootHash: 'boot',
      bundle: '',
      bundleHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
  };
  return { runtime, build, requests };
}

it('does not acquire the shared fence when the current runtime is unavailable', async () => {
  const f = player({ ready: false });
  await expect(f.runtime.hotBuild(f.build, () => {})).rejects.toThrow('Restart');
  expect(f.runtime.liveHotUpdate).not.toHaveBeenCalled();
  expect(f.requests).toEqual(['hot:status']);
});

it('aborts a prepared fence on a definitive rejection before code is applied', async () => {
  const f = player({ rejection: true });
  await expect(f.runtime.hotBuild(f.build, () => {})).rejects.toThrow('unavailable');
  expect(f.runtime.liveHotUpdate.mock.calls.map(([message]) => message.phase)).toEqual(['begin', 'abort']);
  expect(f.requests).toEqual(['hot:status', 'hot:apply']);
  expect(f.runtime.revision).toBe('A');
  expect(f.runtime.hotUpdating).toBe(false);
});

it('retains the fence when a lost reply leaves the commit outcome uncertain', async () => {
  const f = player({ lostReply: true });
  await expect(f.runtime.hotBuild(f.build, () => {})).rejects.toThrow('outcome uncertain');
  expect(f.runtime.liveHotUpdate.mock.calls.map(([message]) => message.phase)).toEqual(['begin']);
  expect(f.requests).toEqual(['hot:status', 'hot:apply', 'hot:result']);
});
