import { expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { playApi } from './play-signals.js';
import { journalApi, type PlayJournal } from './workbench-launch.js';
import { activityApi } from './tui/activity.js';

it.each(['caller', 'shutdown'])(
  'cancels a pending platform mutation via %s without replaying an unknown outcome',
  async (which) => {
    const shutdown = new AbortController(),
      caller = new AbortController();
    let pending: AbortSignal | undefined;
    const send = vi.fn(async (_url, init) => {
      pending = init.signal;
      return await new Promise<Response>((_resolve, reject) => {
        pending!.addEventListener('abort', () => reject(pending!.reason), { once: true });
      });
    });
    const raw = createApi({
      origin: 'https://example.test',
      store: memoryStore(),
      env: { GAMEDEV_TOKEN: 'test' },
      fetch: send,
    });
    const journal: PlayJournal = { version: 1, instance: 'test', cwd: '/tmp' };
    const restore = vi.fn();
    const api = activityApi(playApi(journalApi(raw, journal, vi.fn()), shutdown.signal), () => restore);
    const request = api.request('POST', '/api/submissions', { title: 'Game' }, caller.signal);
    const cancelled = expect(request).rejects.toThrow();
    await vi.waitFor(() => expect(pending).toBeDefined());
    (which === 'caller' ? caller : shutdown).abort();
    await cancelled;
    expect(restore).toHaveBeenCalledOnce();
    expect(journal.pending?.path).toBe('/api/submissions');
    await expect(journalApi(raw, journal, vi.fn()).request('POST', '/api/submissions', {})).rejects.toThrow(
      'unknown outcome',
    );
    expect(send).toHaveBeenCalledOnce();
  },
);

it('cancels an archive download and token refresh when Play shuts down', async () => {
  const shutdown = new AbortController();
  let pending: AbortSignal | undefined;
  const raw = createApi({
    origin: 'https://example.test',
    shutdownSignal: shutdown.signal,
    env: {},
    store: memoryStore({
      accessToken: 'expired',
      refreshToken: 'refresh',
      tokenType: 'Bearer',
      scope: 'creator',
    }),
    fetch: async (url, init) => {
      if (!String(url).endsWith('/oauth/token')) return new Response('{}', { status: 401 });
      pending = init?.signal as AbortSignal;
      return await new Promise<Response>((_resolve, reject) =>
        pending!.addEventListener('abort', () => reject(pending!.reason), { once: true }),
      );
    },
  });
  const request = playApi(raw, shutdown.signal).requestBytes('/archive');
  const cancelled = expect(request).rejects.toThrow();
  await vi.waitFor(() => expect(pending).toBeDefined());
  shutdown.abort();
  await cancelled;
});

it('does not start or journal a new mutation after Play has stopped', async () => {
  const shutdown = new AbortController();
  shutdown.abort();
  const send = vi.fn();
  const raw = createApi({
    origin: 'https://example.test',
    store: memoryStore(),
    env: { GAMEDEV_TOKEN: 'test' },
    fetch: send,
  });
  const journal: PlayJournal = { version: 1, instance: 'test', cwd: '/tmp' };
  const api = playApi(journalApi(raw, journal, vi.fn()), shutdown.signal);
  await expect(api.request('POST', '/api/submissions', {})).rejects.toThrow();
  expect(journal.pending).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});
