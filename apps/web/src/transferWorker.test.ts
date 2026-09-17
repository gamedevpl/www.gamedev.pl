// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function worker(status: number, body: unknown, consumeResponse = false) {
  const listeners = new Map<string, (event: unknown) => void>();
  const navigate = vi.fn(async () => undefined);
  const fetch = vi.fn(async () => Response.json(body, { status }));
  const get = vi.fn(async () => ({ url: 'https://example.test/studio', navigate }));
  runInNewContext(source, {
    URL,
    Response,
    fetch,
    self: {
      location: { origin: 'https://example.test' },
      clients: { get },
      addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    },
  });
  async function request(path: string, method = 'POST') {
    const respondWith = vi.fn((response: Promise<Response>) => {
      if (consumeResponse) void response.then((result) => result.text());
    });
    const waiting: Promise<unknown>[] = [];
    const request = new Request(new URL(path, 'https://example.test'), { method });
    listeners.get('fetch')!({
      request,
      clientId: 'sender',
      respondWith,
      waitUntil: (p: Promise<unknown>) => waiting.push(p),
    });
    await Promise.all(waiting);
    return { respondWith, request };
  }
  return { request, navigate, fetch, get };
}

describe('old transfer shell recovery', () => {
  it('checks compatibility before the browser consumes the response stream', async () => {
    const sw = worker(409, { error: 'stale_client' }, true);
    await sw.request('/api/me/transfers/sky/accept');
    expect(sw.navigate).toHaveBeenCalledExactlyOnceWith('https://example.test/studio');
  });

  it.each(['/api/me/transfers/sky/accept', '/api/me/transfers/sky/reject', '/api/me/studio/games/sky/transfer/cancel'])(
    'reloads only the requesting window for %s without replaying the action',
    async (path) => {
      const sw = worker(409, { error: 'stale_client' });
      const { respondWith, request } = await sw.request(path);
      expect(sw.fetch).toHaveBeenCalledExactlyOnceWith(request);
      expect(sw.get).toHaveBeenCalledExactlyOnceWith('sender');
      expect(sw.navigate).toHaveBeenCalledExactlyOnceWith('https://example.test/studio');
      const response = (await respondWith.mock.calls[0]![0]) as Response;
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'stale_client' });
    },
  );

  it.each([
    [409, { error: 'busy' }],
    [404, { error: 'not_found' }],
    [200, { transfer: {} }],
  ])('preserves normal response %s without reloading', async (status, body) => {
    const sw = worker(status as number, body);
    await sw.request('/api/me/transfers/sky/accept');
    expect(sw.fetch).toHaveBeenCalledTimes(1);
    expect(sw.navigate).not.toHaveBeenCalled();
  });

  it.each(['/api/other', 'https://other.test/api/me/transfers/sky/accept'])(
    'does not intercept unrelated requests: %s',
    async (path) => {
      const sw = worker(409, { error: 'stale_client' });
      const { respondWith } = await sw.request(path);
      expect(respondWith).not.toHaveBeenCalled();
      expect(sw.fetch).not.toHaveBeenCalled();
    },
  );
});
