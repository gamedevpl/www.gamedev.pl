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
    gameRequest(
      frame: HTMLIFrameElement,
      type: string,
      data?: Record<string, unknown>,
      timeout?: number,
    ): Promise<unknown>;
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

async function resourcePlayer(outcome = 'prepared') {
  const f = player();
  const payload = JSON.stringify({ version: 1, images: {}, theme: '#game { background: #123456; }' });
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))).toString('hex');
  const build = {
    ...f.build,
    html: '<script type="application/json" id="gk-hot-resources">' + payload + '</script>',
    hot: {
      ...f.build.hot,
      protocol: 2,
      resources: { version: 1, hash, bytes: new TextEncoder().encode(payload).byteLength },
    },
  };
  const order: string[] = [];
  f.runtime.gameRequest = vi.fn(async (_frame, type) => {
    order.push(type);
    if (type === 'hot:status') return { protocol: 2, bootHash: 'boot', epoch: 0, ready: true };
    if (type === 'hot:prepare') return { status: outcome, reason: 'incompatible' };
    if (type === 'hot:abort') return true;
    if (type === 'hot:apply') return { status: 'applied', epoch: 1, ready: true, frame: 42, simulationTick: 32 };
    throw Error('Unexpected operation');
  });
  f.runtime.liveHotUpdate.mockImplementation(async (message) => {
    order.push('server:' + message.phase);
    return { state: message.phase === 'finish' ? 'committed' : 'prepared' };
  });
  return { ...f, build, order };
}

it('verifies resource bytes and prepares before fencing live observations or committing', async () => {
  const f = await resourcePlayer();
  expect(await f.runtime.hotBuild(f.build, () => {})).toBe(true);
  expect(f.order).toEqual(['hot:status', 'hot:prepare', 'server:begin', 'hot:apply', 'server:finish', 'hot:abort']);
  expect(f.runtime.revision).toBe('B');
  expect(f.runtime.liveEpoch).toBe(1);
});

it('uses validated checkpoint fallback on resource incompatibility without creating a commit fence', async () => {
  const f = await resourcePlayer('rejected');
  expect(await f.runtime.hotBuild(f.build, () => {})).toBeNull();
  expect(f.runtime.liveHotUpdate).not.toHaveBeenCalled();
  expect(f.order).toEqual(['hot:status', 'hot:prepare', 'hot:abort']);
  expect(f.runtime.revision).toBe('A');
});

it('rejects mismatched resource bytes before candidate evaluation', async () => {
  const f = await resourcePlayer();
  f.build.html = f.build.html.replace('#123456', '#654321');
  await expect(f.runtime.hotBuild(f.build, () => {})).rejects.toThrow('resource hash');
  expect(f.runtime.liveHotUpdate).not.toHaveBeenCalled();
  expect(f.order).toEqual(['hot:status', 'hot:abort']);
});

it('aborts prepared resources when an agent operation begins during decoding', async () => {
  const f = await resourcePlayer();
  const request = f.runtime.gameRequest;
  f.runtime.gameRequest = async (...args) => {
    const result = await request(...args);
    if (args[1] === 'hot:prepare') f.runtime.liveOperation = true;
    return result;
  };
  await expect(f.runtime.hotBuild(f.build, () => {})).rejects.toThrow('Wait');
  expect(f.runtime.liveHotUpdate).not.toHaveBeenCalled();
  expect(f.order.at(-1)).toBe('hot:abort');
});
