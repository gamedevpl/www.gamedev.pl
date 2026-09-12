import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  chooseEncoding,
  encodingQuality,
  registerApiCompression,
  withAcceptEncoding,
  worthCompressing,
} from './api-compression.js';

const BIG_JSON = { games: Array.from({ length: 400 }, (_, index) => ({ slug: `game-${index}`, title: 'A Game' })) };

async function appUnderTest(): Promise<FastifyInstance> {
  const app = Fastify();
  registerApiCompression(app);
  app.get('/api/catalog', async () => BIG_JSON);
  // Imperative send, the shape play and preview use.
  app.get('/api/sent', async (_request, reply) => {
    reply.header('vary', 'Origin').send(BIG_JSON);
  });
  app.get('/api/tiny', async () => ({ ok: true }));
  app.get('/api/games/a/media/shot.png', async (_request, reply) =>
    reply.type('image/png').send(Buffer.alloc(64 * 1024, 7)),
  );
  app.get('/health', async () => BIG_JSON);
  await app.ready();
  return app;
}

describe('worthCompressing', () => {
  it('refuses a body that is already encoded', () => {
    expect(worthCompressing('application/json', 100_000, true)).toBe(false);
  });

  it('refuses bodies too small to pay for the framing', () => {
    expect(worthCompressing('application/json', 200, false)).toBe(false);
  });

  it('refuses media, which is compressed already', () => {
    expect(worthCompressing('image/png', 500_000, false)).toBe(false);
    expect(worthCompressing('video/mp4', 5_000_000, false)).toBe(false);
  });

  it('accepts generated text', () => {
    expect(worthCompressing('application/json; charset=utf-8', 100_000, false)).toBe(true);
    expect(worthCompressing('text/html', 100_000, false)).toBe(true);
  });
});

describe('encoding negotiation', () => {
  it('reads a quality value rather than matching a substring', () => {
    expect(encodingQuality('br;q=0, gzip;q=1', 'br')).toBe(0);
    expect(encodingQuality('br;q=0, gzip;q=1', 'gzip')).toBe(1);
    expect(encodingQuality('gzip, deflate, br', 'br')).toBe(1);
    expect(encodingQuality('gzip;q=0.5', 'gzip')).toBe(0.5);
  });

  it('treats an unlisted encoding as unacceptable unless a wildcard says otherwise', () => {
    expect(encodingQuality('gzip', 'br')).toBe(0);
    expect(encodingQuality('gzip, *', 'br')).toBe(1);
    expect(encodingQuality(undefined, 'gzip')).toBe(0);
  });

  it('picks brotli only when it is at least as welcome as gzip', () => {
    expect(chooseEncoding('gzip, deflate, br')).toBe('br');
    expect(chooseEncoding('br;q=0.5, gzip;q=1')).toBe('gzip');
    expect(chooseEncoding('br;q=0, gzip;q=0')).toBe('identity');
    expect(chooseEncoding(undefined)).toBe('identity');
  });
});

describe('api compression', () => {
  it('brotli-encodes a large JSON response and says so', async () => {
    const app = await appUnderTest();
    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    });

    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['vary']).toContain('accept-encoding');
    const decoded = JSON.parse(brotliDecompressSync(response.rawPayload).toString('utf8'));
    expect(decoded).toEqual(BIG_JSON);
    expect(Number(response.headers['content-length'])).toBe(response.rawPayload.length);
    await app.close();
  });

  it('falls back to gzip for a client that cannot take brotli', async () => {
    const app = await appUnderTest();
    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'accept-encoding': 'gzip' },
    });

    expect(response.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(response.rawPayload).toString('utf8'))).toEqual(BIG_JSON);
    await app.close();
  });

  it('sends plain bytes to a client that accepts no encoding', async () => {
    const app = await appUnderTest();
    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.json()).toEqual(BIG_JSON);
    await app.close();
  });

  it('varies on the plain copy too, or a cache serves it to everyone', async () => {
    const app = await appUnderTest();
    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.headers['vary']).toContain('accept-encoding');
    await app.close();
  });

  it('obeys a client that refuses an encoding outright', async () => {
    const app = await appUnderTest();
    const noBrotli = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'accept-encoding': 'br;q=0, gzip' },
    });
    expect(noBrotli.headers['content-encoding']).toBe('gzip');

    const neither = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'accept-encoding': 'br;q=0, gzip;q=0' },
    });
    expect(neither.headers['content-encoding']).toBeUndefined();
    expect(neither.headers['vary']).toContain('accept-encoding');
    await app.close();
  });

  it('actually makes the catalog smaller', async () => {
    const app = await appUnderTest();
    const plain = await app.inject({ method: 'GET', url: '/api/catalog' });
    const encoded = await app.inject({
      method: 'GET',
      url: '/api/catalog',
      headers: { 'accept-encoding': 'br' },
    });
    expect(encoded.rawPayload.length).toBeLessThan(plain.rawPayload.length / 4);
    await app.close();
  });

  it('leaves small responses alone', async () => {
    const app = await appUnderTest();
    const response = await app.inject({
      method: 'GET',
      url: '/api/tiny',
      headers: { 'accept-encoding': 'br' },
    });
    expect(response.headers['content-encoding']).toBeUndefined();
    await app.close();
  });

  it('never spends CPU on media bytes', async () => {
    const app = await appUnderTest();
    const response = await app.inject({
      method: 'GET',
      url: '/api/games/a/media/shot.png',
      headers: { 'accept-encoding': 'br' },
    });
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.rawPayload.length).toBe(64 * 1024);
    await app.close();
  });

  it('leaves the static shell to its build-time siblings', async () => {
    const app = await appUnderTest();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'accept-encoding': 'br' },
    });
    expect(response.headers['content-encoding']).toBeUndefined();
    await app.close();
  });
});

describe('withAcceptEncoding', () => {
  it('adds itself to whatever vary is already there', () => {
    expect(withAcceptEncoding(undefined)).toBe('accept-encoding');
    expect(withAcceptEncoding('Origin')).toBe('Origin, accept-encoding');
  });

  it('does not repeat itself', () => {
    expect(withAcceptEncoding('Origin, accept-encoding')).toBe('Origin, accept-encoding');
    expect(withAcceptEncoding('Accept-Encoding')).toBe('Accept-Encoding');
  });
});

describe('a body sent imperatively', () => {
  it('is compressed like any other, and keeps the vary it already had', async () => {
    const app = await appUnderTest();
    const response = await app.inject({
      method: 'GET',
      url: '/api/sent',
      headers: { 'accept-encoding': 'br' },
    });
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['vary']).toBe('Origin, accept-encoding');
    await app.close();
  });
});
