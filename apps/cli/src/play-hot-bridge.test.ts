import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { PLAY_JOURNAL_RECORDER } from '@gamedevpl/contract';
import { PLAY_HOT_BRIDGE } from './play-hot-bridge.js';

const windows: JSDOM[] = [];
afterEach(() => windows.splice(0).forEach((dom) => dom.window.close()));
function fixture() {
  const dom = new JSDOM('<html><head></head><body></body></html>', { runScripts: 'dangerously' });
  windows.push(dom);
  const win = dom.window,
    messages: {
      id?: string;
      recordingId?: string;
      json?: string;
      error?: string;
      definitive?: boolean;
      data?: Record<string, unknown>;
    }[] = [];
  win.postMessage = (value: unknown) => {
    messages.push(value as (typeof messages)[number]);
  };
  win.requestAnimationFrame = () => 1;
  let epoch = 0;
  const h = { ready: true, frame: 4, metadata: { build: 'old' }, step() {} };
  const status = () => ({ epoch, ready: h.ready, frame: h.frame, simulationTick: 3 });
  const replace = vi.fn((definition: { build: string; fail?: boolean }, expected: number) => {
    if (expected !== epoch) return { status: 'rejected', reason: 'stale-epoch', ...status() };
    epoch++;
    h.metadata = { build: definition.build };
    h.ready = !definition.fail;
    return { status: definition.fail ? 'failed' : 'applied', ...status() };
  });
  Object.assign(win, {
    __GAME_HARNESS__: h,
    __GAME_HOT__: { protocol: 1, bootHash: 'boot', controller: { status, replace } },
  });
  win.eval(PLAY_JOURNAL_RECORDER + PLAY_HOT_BRIDGE);
  const send = (data: object, source: Window | null = win as unknown as Window) => {
    win.dispatchEvent(
      new win.MessageEvent('message', {
        source,
        data: { source: 'gdpl-workbench', id: 'rpc', type: 'hot:apply', data },
      }),
    );
    return messages.filter((m) => m.id === 'rpc').at(-1);
  };
  const input = {
    id: 'transaction',
    bootHash: 'boot',
    expectedEpoch: 0,
    previousRevision: 'A',
    revision: 'B',
    bundleHash: 'hash',
    stateVersion: 1,
    observationVersion: 1,
    bundle: "window.__GAME_HOT__.register({build:'new'});",
  };
  return { win, messages, replace, status, send, input };
}

it('requires the parent and checks compatibility before evaluating candidate code', () => {
  const f = fixture();
  expect(f.send(f.input, null)).toBeUndefined();
  expect(f.send({ ...f.input, bootHash: 'other', bundle: 'window.sideEffect=true' })).toMatchObject({
    error: expect.stringContaining('fingerprint'),
    definitive: true,
  });
  expect((f.win as unknown as { sideEffect?: boolean }).sideEffect).toBeUndefined();
  expect(f.replace).not.toHaveBeenCalled();
});

it('marks an unavailable runtime rejection as definitive before creating any receipt', () => {
  const f = fixture();
  f.send({ ...f.input, bundle: "window.__GAME_HOT__.register({build:'failed',fail:true});" });
  expect(f.send({ ...f.input, id: 'retry', expectedEpoch: 1 })).toMatchObject({
    error: expect.stringContaining('runtime'),
    definitive: true,
  });
  expect(f.replace).toHaveBeenCalledTimes(1);
});
it('registers once and reports the committed outcome on an idempotent retry', () => {
  const f = fixture();
  const first = f.send(f.input).data;
  expect(first).toMatchObject({ status: 'applied', epoch: 1, frame: 4, simulationTick: 3 });
  expect(first.recordingId).not.toBe(first.previousRecordingId);
  expect(f.send(f.input).data).toEqual(first);
  expect(f.replace).toHaveBeenCalledTimes(1);
  expect(f.send({ ...f.input, revision: 'C' }).error).toContain('reused');
});
it('keeps the old epoch on preparation failure and records post-commit failure under the new epoch', () => {
  const f = fixture();
  const rejected = f.send({ ...f.input, bundle: "throw Error('preparation failed')" }).data;
  expect(rejected).toMatchObject({ status: 'rejected', epoch: 0 });
  expect(rejected.recordingId).toBe(rejected.previousRecordingId);
  const failed = f.send({
    ...f.input,
    id: 'second',
    bundle: "window.__GAME_HOT__.register({build:'failed',fail:true});",
  }).data;
  expect(failed).toMatchObject({ status: 'failed', epoch: 1, ready: false });
  expect(failed.recordingId).not.toBe(failed.previousRecordingId);
  const states = f.messages
    .filter((m) => m.recordingId === failed.recordingId)
    .flatMap((m) => (m.json ? JSON.parse(m.json) : []));
  expect(states.some((e) => e.kind === 'gap' && e.data.reason.includes('Committed code failed'))).toBe(true);
  expect(states.some((e) => e.kind === 'state')).toBe(false);
});

it('reports current unavailability when a historical success is queried after a later error', () => {
  const f = fixture();
  expect(f.send(f.input)?.data).toMatchObject({ status: 'applied', epoch: 1 });
  f.win.dispatchEvent(new f.win.ErrorEvent('error', { message: 'later callback failed' }));
  expect(f.send(f.input)?.data).toMatchObject({ status: 'failed', epoch: 1, ready: false });
  expect(f.replace).toHaveBeenCalledTimes(1);
});

function resourceFixture() {
  const f = fixture();
  const hot = (
    f.win as unknown as {
      __GAME_HOT__: {
        protocol: number;
        controller: { stage: ReturnType<typeof vi.fn>; discard: ReturnType<typeof vi.fn> };
      };
    }
  ).__GAME_HOT__;
  hot.protocol = 2;
  hot.controller.stage = vi.fn(async () => ({ status: 'prepared', token: { resource: true } }));
  hot.controller.discard = vi.fn();
  const input = {
    ...f.input,
    protocol: 2,
    resources: { version: 1, hash: 'resource-hash', bytes: 50 },
    payload: { version: 1, images: {}, theme: '' },
  };
  async function send(type: string, data: object) {
    const id = crypto.randomUUID();
    f.win.dispatchEvent(
      new f.win.MessageEvent('message', {
        source: f.win as unknown as Window,
        data: { source: 'gdpl-workbench', id, type, data },
      }),
    );
    await vi.waitFor(() => expect(f.messages.some((m) => m.id === id)).toBe(true));
    return f.messages.find((m) => m.id === id)!;
  }
  return { ...f, hot, input, request: send };
}

it('prepares resources while the old segment runs, commits once and records the resource hash', async () => {
  const f = resourceFixture();
  expect((await f.request('hot:prepare', f.input)).data).toEqual({ status: 'prepared' });
  expect(f.replace).not.toHaveBeenCalled();
  expect(f.status().epoch).toBe(0);
  const result = (await f.request('hot:apply', f.input)).data;
  expect(result).toMatchObject({ status: 'applied', epoch: 1 });
  expect(f.replace).toHaveBeenCalledWith({ build: 'new' }, 0, { resource: true });
  const batches = f.messages.filter((m) => m.recordingId === result?.recordingId) as unknown as {
    segment: { protocol: number; resourceHash: string };
  }[];
  expect(batches.some((batch) => batch.segment.protocol === 2 && batch.segment.resourceHash === 'resource-hash')).toBe(
    true,
  );
  expect((await f.request('hot:apply', f.input)).data).toEqual(result);
  expect(f.replace).toHaveBeenCalledTimes(1);
});

it('aborts pending assets and fences superseded or expired resource preparations', async () => {
  const f = resourceFixture();
  let release!: (value: object) => void;
  f.hot.controller.stage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const preparing = f.request('hot:prepare', f.input);
  await f.request('hot:abort', { id: f.input.id });
  release({ status: 'prepared', token: {} });
  expect((await preparing).data).toMatchObject({ status: 'rejected', reason: 'superseded' });
  expect((await f.request('hot:apply', f.input)).error).toContain('expired');
  expect(f.hot.controller.discard).toHaveBeenCalled();
  expect(f.replace).not.toHaveBeenCalled();
});

it('does not suppress live errors while resources decode', async () => {
  const f = resourceFixture();
  let release!: (value: object) => void;
  f.hot.controller.stage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const input = { ...f.input, id: 'next', expectedEpoch: 0 };
  const pending = f.request('hot:prepare', input);
  f.win.dispatchEvent(new f.win.ErrorEvent('error', { message: 'old callback failed' }));
  expect(f.messages.some((m) => (m as unknown as { type: string }).type === 'unavailable')).toBe(true);
  expect(f.hot.controller.discard).toHaveBeenCalled();
  release({ status: 'prepared', token: {} });
  await pending;
});
