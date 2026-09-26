import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { captureNetworkPolicy } from './capture-network-policy.js';

it('forwards only the fixed capture document and denies proxy tunnels', async () => {
  let hits = 0;
  const source = createServer((_request, response) => {
    hits++;
    response.end('capture document');
  });
  source.listen(0, '127.0.0.1');
  await once(source, 'listening');
  const address = source.address();
  if (!address || typeof address === 'string') throw new Error('Missing source listener');
  const url = `http://127.0.0.1:${address.port}/capture-key/`;
  const policy = await captureNetworkPolicy(url);
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
    await expect(fetchThroughProxy(url)).resolves.toEqual({ status: 200, body: 'capture document' });
    await expect(fetchThroughProxy(url + 'other')).resolves.toMatchObject({ status: 403 });
    await expect(fetchThroughProxy('https://example.invalid/')).resolves.toMatchObject({ status: 403 });
    await expect(fetchThroughProxy('127.0.0.1:1', 'CONNECT')).rejects.toThrow();
    expect(hits).toBe(1);
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
