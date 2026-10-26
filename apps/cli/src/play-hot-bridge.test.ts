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
    messages: { id?: string; recordingId?: string; json?: string; error?: string; data?: Record<string, unknown> }[] =
      [];
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
  expect(f.send({ ...f.input, bootHash: 'other', bundle: 'window.sideEffect=true' }).error).toContain('fingerprint');
  expect((f.win as unknown as { sideEffect?: boolean }).sideEffect).toBeUndefined();
  expect(f.replace).not.toHaveBeenCalled();
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
