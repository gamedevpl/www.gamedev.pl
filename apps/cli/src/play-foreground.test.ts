import { afterEach, expect, it, vi } from 'vitest';
import { playForeground } from './play-foreground.js';

vi.mock('./play.js', () => ({
  playGame: vi.fn(async () => ({ mode: 'local', url: 'http://127.0.0.1:12345/preview/' })),
}));
vi.mock('./play-presence.js', () => ({
  holdPreview: vi.fn(async (_url, signal: AbortSignal) => {
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
  }),
}));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => undefined) }));
afterEach(() => vi.unstubAllGlobals());

it.each(['timeout', 'unhealthy'])('keeps owning the preview through a transient %s', async (failure) => {
  let healthChecks = 0;
  const send = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/stop')) {
      expect(init?.method).toBe('POST');
      return new Response('stopped');
    }
    healthChecks++;
    if (healthChecks === 1) {
      if (failure === 'timeout') throw new DOMException('slow scan', 'TimeoutError');
      return new Response('temporarily unavailable', { status: 503 });
    }
    process.emit('SIGINT');
    return new Response('{}');
  });
  vi.stubGlobal('fetch', send);
  await expect(playForeground({ cwd: '/tmp', origin: 'https://example.test', write: vi.fn() })).resolves.toMatchObject({
    mode: 'local',
  });
  expect(healthChecks).toBe(2);
  expect(send.mock.calls.filter(([url]) => url.endsWith('/stop'))).toHaveLength(1);
});

it('ends ownership when the preview server has gone away', async () => {
  const send = vi.fn(async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
  });
  vi.stubGlobal('fetch', send);
  await expect(playForeground({ cwd: '/tmp', origin: 'https://example.test', write: vi.fn() })).resolves.toMatchObject({
    mode: 'local',
  });
  expect(send).toHaveBeenCalledOnce();
});
