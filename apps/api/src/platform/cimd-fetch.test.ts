import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCimdFetcher, isBlockedAddress, validateCimdUrl } from './cimd-fetch.js';

describe('validateCimdUrl', () => {
  it('accepts a client metadata path', () => {
    expect(validateCimdUrl('https://chatgpt.com/oauth/client.json')?.pathname).toBe('/oauth/client.json');
  });

  it.each([
    'http://example.com/client.json',
    'https://127.0.0.1/client.json',
    'https://[::1]/client.json',
    'https://name:password@example.com/client.json',
    'https://example.com/client.json#fragment',
    'https://example.com:8443/client.json',
    'https://example.com/',
    'https://example.com/a/../client.json',
    'https://example.com/a/%2e%2e/client.json',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('rejects %s', (url) => {
    expect(validateCimdUrl(url)).toBeNull();
  });
});

describe('isBlockedAddress', () => {
  it.each([
    ['0.4.5.6', 4],
    ['10.0.0.1', 4],
    ['100.64.0.1', 4],
    ['127.0.0.1', 4],
    ['169.254.169.254', 4],
    ['172.16.0.1', 4],
    ['192.0.0.1', 4],
    ['192.0.2.1', 4],
    ['192.168.0.1', 4],
    ['198.18.0.1', 4],
    ['198.51.100.1', 4],
    ['203.0.113.1', 4],
    ['224.0.0.1', 4],
    ['240.0.0.1', 4],
    ['::', 6],
    ['::1', 6],
    ['fc00::1', 6],
    ['fe80::1', 6],
    ['ff00::1', 6],
    ['64:ff9b::1', 6],
    ['64:ff9b:1::1', 6],
    ['2001::1', 6],
    ['2001:db8::1', 6],
    ['2002::1', 6],
    ['::ffff:127.0.0.1', 6],
    ['::ffff:169.254.169.254', 6],
    ['::ffff:7f00:1', 6],
  ] as const)('blocks %s', (address, family) => {
    expect(isBlockedAddress(address, family)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 4],
    ['1.1.1.1', 4],
    ['2001:4860:4860::8888', 6],
    ['::ffff:8.8.8.8', 6],
  ] as const)('allows %s', (address, family) => {
    expect(isBlockedAddress(address, family)).toBe(false);
  });
});

describe('createCimdFetcher', () => {
  it('refuses a DNS answer containing a blocked address', async () => {
    const fetcher = createCimdFetcher({
      lookup: (_host, _options, callback) =>
        callback(null, [
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ]),
      timeoutMs: 1000,
    });
    expect(await fetcher('https://example.com/client.json')).toEqual({ ok: false, reason: 'blocked_address' });
  });
});

describe('CIMD response limits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cimd-fetch-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
      ],
      { stdio: 'ignore' },
    );
    server = createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { location: '/ok' }).end();
      } else if (request.url === '/large') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('x'.repeat(70 * 1024));
      } else if (request.url === '/html') {
        response.writeHead(200, { 'content-type': 'text/html' }).end('<p>html</p>');
      } else if (request.url === '/slow') {
        setTimeout(() => response.end('{}'), 200);
        response.writeHead(200, { 'content-type': 'application/json' });
      } else {
        response.writeHead(200, { 'content-type': 'application/json' }).end('{"client_id":"ok"}');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTPS test port');
    port = address.port;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  function localFetcher(timeoutMs = 1000) {
    return createCimdFetcher({
      timeoutMs,
      requestFn: ((
        url: URL,
        options: Parameters<typeof httpsRequest>[1],
        callback: Parameters<typeof httpsRequest>[2],
      ) =>
        httpsRequest(
          new URL(`https://localhost:${port}${url.pathname}`),
          {
            ...options,
            lookup: undefined,
            ca: readFileSync(certPath),
          },
          callback,
        )) as typeof httpsRequest,
    });
  }

  it.each([
    ['/redirect', 'redirect'],
    ['/large', 'too_large'],
    ['/html', 'content_type'],
    ['/slow', 'timeout'],
  ] as const)('rejects %s with %s', async (path, reason) => {
    const result = await localFetcher(path === '/slow' ? 30 : 1000)(`https://example.com${path}`);
    expect(result).toEqual({ ok: false, reason });
  });

  it('parses a small JSON document', async () => {
    expect(await localFetcher()('https://example.com/ok')).toEqual({ ok: true, body: { client_id: 'ok' } });
  });

  it('parses JSON through Node’s all-address lookup', async () => {
    let sawAll = false;
    const fetcher = createCimdFetcher({
      lookup: (_host, _options, callback) => callback(null, [{ address: '8.8.8.8', family: 4 }]),
      requestFn: ((url: URL, options: Parameters<typeof httpsRequest>[1], callback: Parameters<typeof httpsRequest>[2]) =>
        httpsRequest(
          new URL(`https://client.example:${port}${url.pathname}`),
          {
            ...options,
            autoSelectFamily: true,
            servername: 'localhost',
            lookup(host, lookupOptions, nodeCallback) {
              sawAll = lookupOptions.all === true;
              const securedLookup = options.lookup;
              if (!securedLookup) throw new Error('Missing CIMD lookup');
              securedLookup(host, lookupOptions, (error, addresses, family) => {
                if (error || !Array.isArray(addresses)) {
                  nodeCallback(error, addresses, family);
                  return;
                }
                nodeCallback(
                  null,
                  addresses.map(() => ({ address: '127.0.0.1', family: 4 })),
                );
              });
            },
            ca: readFileSync(certPath),
          },
          callback,
        )) as typeof httpsRequest,
    });

    expect(await fetcher('https://example.com/ok')).toEqual({ ok: true, body: { client_id: 'ok' } });
    expect(sawAll).toBe(true);
  });
});
