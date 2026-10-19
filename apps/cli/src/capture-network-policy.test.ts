import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { captureNetworkPolicy } from './capture-network-policy.js';

it('forwards only the fixed capture document and denies proxy tunnels', async () => {
  let hits = 0;
  const source = createServer((incoming, response) => {
    hits++;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(incoming.url);
  });
  source.listen(0, '127.0.0.1');
  await once(source, 'listening');
  const address = source.address();
  if (!address || typeof address === 'string') throw new Error('Missing source listener');
  const url = `http://127.0.0.1:${address.port}/capture-key/`;
  const gameUrl = url + 'game?capture=1&seed=42';
  const policy = await captureNetworkPolicy(url, gameUrl);
  const proxy = new URL(policy.flags[0].slice('--proxy-server='.length));
  const fetchThroughProxy = (target: string, method = 'GET') =>
    new Promise<{ status?: number; body: string }>((resolve, reject) => {
      const connection = request(
        { hostname: proxy.hostname, port: proxy.port, path: target, method, headers: { Host: new URL(url).host } },
        (response) => {
          let body = '';
          response.on('data', (data) => {
            body += data.toString();
          });
          response.on('end', () => resolve({ status: response.statusCode, body }));
        },
      );
      connection.on('error', reject);
      connection.end();
    });
  try {
    await expect(fetchThroughProxy(url)).resolves.toEqual({ status: 200, body: '/capture-key/' });
    await expect(fetchThroughProxy(gameUrl)).resolves.toEqual({
      status: 200,
      body: '/capture-key/game?capture=1&seed=42',
    });
    await expect(fetchThroughProxy(gameUrl.replace('seed=42', 'seed=43'))).resolves.toMatchObject({ status: 403 });
    await expect(fetchThroughProxy(url + 'other')).resolves.toMatchObject({ status: 403 });
    await expect(fetchThroughProxy('https://example.invalid/')).resolves.toMatchObject({ status: 403 });
    await expect(fetchThroughProxy('127.0.0.1:1', 'CONNECT')).rejects.toThrow();
    expect(hits).toBe(2);
  } finally {
    await policy.close();
    await new Promise<void>((resolve) => source.close(() => resolve()));
  }
});

it.each(['https://127.0.0.1:1234/', 'http://example.invalid:1234/', 'http://user:pass@127.0.0.1:1234/'])(
  'rejects non-capture URLs: %s',
  async (url) => {
    await expect(captureNetworkPolicy(url)).rejects.toThrow('loopback');
  },
);

it('rejects a scenario document on another origin', async () => {
  await expect(captureNetworkPolicy('http://127.0.0.1:1234/capture', 'http://127.0.0.1:4567/game')).rejects.toThrow(
    'server origin',
  );
});
