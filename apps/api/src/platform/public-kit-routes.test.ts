import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import { buildApp } from './app.js';
import { publicKitDownloadEnabled, registerPublicKitRoutes } from './public-kit-routes.js';
import { InMemoryStore } from './store.js';

const CURRENT = 'a'.repeat(40);
const PREVIOUS = 'b'.repeat(40);
const RETIRED = 'c'.repeat(40);

function objectStore(objects: string[]): GcsObjectStore & { signed: string[] } {
  const signed: string[] = [];
  return {
    signed,
    async readObject(name) {
      if (name !== 'kits/current.json') return null;
      return Buffer.from(JSON.stringify({ current: CURRENT, previous: PREVIOUS, updatedAt: '2026-10-11T00:00:00Z' }));
    },
    async objectExists(name) {
      return objects.includes(name);
    },
    async signReadUrl(name) {
      signed.push(name);
      return `https://storage.googleapis.com/bucket/${name}?X-Goog-Signature=sig`;
    },
  };
}

function server(enabled: boolean, store = objectStore([`kits/${CURRENT}.tgz`, `kits/${PREVIOUS}.tgz`, `kits/${RETIRED}.tgz`])) {
  const app = Fastify();
  registerPublicKitRoutes(app, { objectStore: store, enabled });
  return { app, store };
}

describe('public kit download', () => {
  it('redirects the current and previous kit to a signed URL', async () => {
    const { app, store } = server(true);
    for (const ref of [CURRENT, PREVIOUS]) {
      const res = await app.inject({ method: 'GET', url: `/api/kit/${ref}.tgz` });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain(`kits/${ref}.tgz`);
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
    expect(store.signed).toEqual([`kits/${CURRENT}.tgz`, `kits/${PREVIOUS}.tgz`]);
  });

  it('404s when disabled, outside the N/N−1 window, malformed, or missing', async () => {
    expect((await server(false).app.inject({ method: 'GET', url: `/api/kit/${CURRENT}.tgz` })).statusCode).toBe(404);
    const { app, store } = server(true);
    for (const url of [`/api/kit/${RETIRED}.tgz`, '/api/kit/current.json', `/api/kit/${CURRENT}.json`, '/api/kit/..%2Fgames.tgz']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect(store.signed).toEqual([]);
    const empty = server(true, objectStore([])).app;
    expect((await empty.inject({ method: 'GET', url: `/api/kit/${CURRENT}.tgz` })).statusCode).toBe(404);
  });

  it('reads the flag from PUBLIC_KIT_DOWNLOAD', () => {
    expect(publicKitDownloadEnabled({})).toBe(false);
    expect(publicKitDownloadEnabled({ PUBLIC_KIT_DOWNLOAD: 'true' })).toBe(true);
    expect(publicKitDownloadEnabled({ PUBLIC_KIT_DOWNLOAD: '1' })).toBe(false);
  });

  it('passes the private-beta wall so npm can fetch it without a session', async () => {
    const app = await buildApp({ store: new InMemoryStore(), betaAllowedUids: 'g:owner' });
    const res = await app.inject({ method: 'GET', url: `/api/kit/${CURRENT}.tgz` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
