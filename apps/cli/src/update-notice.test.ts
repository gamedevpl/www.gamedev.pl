import { afterEach, expect, it, vi } from 'vitest';
import { startUpdateNotice } from './update-notice.js';

const releases = (...versions: string[]) => new Response(JSON.stringify(versions.map((tag_name) => ({ tag_name }))));
afterEach(() => vi.useRealTimers());

it('announces a newer stable CLI without waiting to return control', async () => {
  const write = vi.fn();
  let finish!: (response: Response) => void;
  const stop = startUpdateNotice({
    currentVersion: '0.12.0',
    write,
    fetchImpl: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  expect(typeof stop).toBe('function');
  expect(write).not.toHaveBeenCalled();
  finish(releases('cli-v0.13.0', 'cli-v0.9.0'));
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(write.mock.calls[0]![0]).toContain('0.12.0 → 0.13.0. Run /update');
  stop();
});

it.each(['cli-v0.12.0', 'cli-v0.11.0', 'cli-v0.14.0-beta'])('does not suggest %s', async (tag) => {
  const write = vi.fn();
  const stop = startUpdateNotice({ currentVersion: '0.12.0', write, fetchImpl: async () => releases(tag) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(write).not.toHaveBeenCalled();
  stop();
});

it('ignores draft and prerelease builds', async () => {
  const write = vi.fn();
  const stop = startUpdateNotice({
    currentVersion: '0.12.0',
    write,
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          { tag_name: 'cli-v0.14.0', draft: true },
          { tag_name: 'cli-v0.13.0', prerelease: true },
          { tag_name: 'cli-v0.12.0' },
        ]),
      ),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(write).not.toHaveBeenCalled();
  stop();
});

it.each(['offline', 'rate-limit', 'invalid-json'])('silently handles %s', async (failure) => {
  const write = vi.fn();
  const stop = startUpdateNotice({
    currentVersion: '0.12.0',
    write,
    fetchImpl: async () => {
      if (failure === 'offline') throw new Error('offline');
      return new Response('invalid', { status: failure === 'rate-limit' ? 403 : 200 });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(write).not.toHaveBeenCalled();
  stop();
});

it.each(['timeout', 'close'])('aborts on %s and suppresses late results', async (reason) => {
  vi.useFakeTimers();
  const write = vi.fn();
  let signal!: AbortSignal;
  let finish!: (response: Response) => void;
  const stop = startUpdateNotice({
    currentVersion: '0.12.0',
    write,
    fetchImpl: (_url, init) => {
      signal = init!.signal!;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  if (reason === 'close') stop();
  else await vi.advanceTimersByTimeAsync(3000);
  expect(signal.aborted).toBe(true);
  finish(releases('cli-v0.13.0'));
  await vi.runAllTimersAsync();
  expect(write).not.toHaveBeenCalled();
  stop();
});
