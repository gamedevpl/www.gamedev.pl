import { afterEach, expect, it, vi } from 'vitest';
import { waitForCaptureReady } from './capture-readiness.js';

afterEach(() => vi.useRealTimers());

it('waits for game readiness and a paint opportunity before resolving', async () => {
  vi.useFakeTimers();
  let ready = false;
  const call = vi.fn(async () => ({ result: { value: ready } }));
  const finished = vi.fn();
  const run = waitForCaptureReady(call, 'http://127.0.0.1:1234/game', new AbortController().signal).then(finished);
  await vi.advanceTimersByTimeAsync(200);
  expect(finished).not.toHaveBeenCalled();
  ready = true;
  await vi.advanceTimersByTimeAsync(100);
  await run;
  expect(finished).toHaveBeenCalledOnce();
  expect(call).toHaveBeenLastCalledWith('Runtime.evaluate', expect.objectContaining({ awaitPromise: true }));
});

it('retries an execution context replaced by navigation', async () => {
  vi.useFakeTimers();
  const call = vi
    .fn()
    .mockRejectedValueOnce(new Error('Execution context was destroyed'))
    .mockResolvedValue({ result: { value: true } });
  const run = waitForCaptureReady(call, 'http://127.0.0.1:1234/game', new AbortController().signal);
  await vi.advanceTimersByTimeAsync(100);
  await run;
  expect(call).toHaveBeenCalledTimes(3);
});

it('fails explicitly when the game never becomes ready', async () => {
  vi.useFakeTimers();
  const call = vi.fn(async () => ({ result: { value: false } }));
  const run = waitForCaptureReady(call, 'http://127.0.0.1:1234/game', new AbortController().signal);
  const rejected = expect(run).rejects.toThrow('Game did not become ready for capture within 30 seconds');
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(call).not.toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({ awaitPromise: true }));
});

it('cancels readiness polling with the capture task', async () => {
  const controller = new AbortController();
  const call = vi.fn(async () => {
    controller.abort();
    return { result: { value: false } };
  });
  await expect(waitForCaptureReady(call, 'http://127.0.0.1:1234/game', controller.signal)).rejects.toThrow();
  expect(call).toHaveBeenCalledOnce();
});

it('preserves browser failures rather than retrying them as navigation', async () => {
  const call = vi.fn().mockRejectedValue(new Error('Browser pipe disconnected'));
  await expect(waitForCaptureReady(call, 'http://127.0.0.1:1234/game', new AbortController().signal)).rejects.toThrow(
    'Browser pipe disconnected',
  );
  expect(call).toHaveBeenCalledOnce();
});

it('surfaces scenario assertion failures instead of reporting a successful screenshot', async () => {
  const call = vi.fn(async () => ({ result: { value: 'assertion failed at frame 5' } }));
  await expect(waitForCaptureReady(call, 'http://127.0.0.1:1234/game', new AbortController().signal)).rejects.toThrow(
    'Capture plan failed: assertion failed',
  );
  expect(call).toHaveBeenCalledOnce();
});
