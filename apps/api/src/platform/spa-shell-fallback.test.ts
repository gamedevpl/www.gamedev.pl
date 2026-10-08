import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerSpaShellFallback } from './spa-shell-fallback.js';

const SHELL = '<!doctype html><html><head><title>gamedev.pl</title></head><body></body></html>';

describe('registerSpaShellFallback', () => {
  const app = Fastify();

  beforeAll(async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'spa-shell-'));
    await writeFile(path.join(root, 'index.html'), SHELL);
    await app.register(fastifyStatic, { root, wildcard: false });
    registerSpaShellFallback(app, {
      readIndexHtml: async () => SHELL,
      getCatalogEntry: async () => null,
      isShareable: async (slug) => slug !== 'walled-game',
      isPastWall: async (slug) => slug !== 'walled-game',
      store: {
        getPublication: async () => null,
        listCatalogEnrichments: async () => [],
        getUserByHandle: async (handle: string) =>
          handle === 'alice' ? { uid: 'u1', handle, createdAt: '2026-01-01T00:00:00Z' } : null,
        getHandleReservation: async () => null,
        getUser: async () => null,
      } as never,
      gamesStore: {} as never,
    });
    await app.ready();
  });

  afterAll(() => app.close());

  async function get(url: string) {
    const res = await app.inject({ method: 'GET', url });
    return { status: res.statusCode, robots: res.headers['x-robots-tag'] };
  }

  it('boots real pages with 200', async () => {
    expect(await get('/')).toEqual({ status: 200, robots: undefined });
    expect(await get('/alice')).toEqual({ status: 200, robots: undefined });
  });

  it('answers missing creators and games with 404', async () => {
    expect((await get('/nobody_here')).status).toBe(404);
    expect((await get('/creators/nobody_here')).status).toBe(404);
    expect((await get('/play/gone-game')).status).toBe(404);
    expect((await get('/no/such/route')).status).toBe(404);
  });

  it('keeps private workspaces and walled games out of the index', async () => {
    expect(await get('/status/abc')).toEqual({ status: 200, robots: 'noindex' });
    expect(await get('/studio/abc/build')).toEqual({ status: 200, robots: 'noindex' });
    expect(await get('/play/walled-game')).toEqual({ status: 200, robots: 'noindex' });
  });
});
