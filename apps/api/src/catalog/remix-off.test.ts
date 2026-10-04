import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';
import { registerGamePageRoutes } from './game-page-routes.js';
import { attachRemixOff, invalidateRemixOffSlugs } from './remix-off.js';

const off = (slug: string) => ({ slug, mode: 'off' as const, updatedAt: 'x' });

describe('remixOff on game data', () => {
  it('flags only switched-off entries in the catalog', async () => {
    const store = new InMemoryStore();
    await store.putRemixSettings(off('quiet'));
    const entries = await attachRemixOff([{ slug: 'quiet' }, { slug: 'open' }], store, 1);
    expect(entries).toEqual([{ slug: 'quiet', remixOff: true }, { slug: 'open' }]);
    await store.putRemixSettings({ ...off('quiet'), mode: 'on' });
    invalidateRemixOffSlugs(store);
    expect(await attachRemixOff([{ slug: 'quiet' }], store, 2)).toEqual([{ slug: 'quiet' }]);
  });

  it('carries remixOff on the game page entry', async () => {
    const store = new InMemoryStore();
    await store.setPublication({ slug: 'quiet', state: 'published', currentVersion: 'v1', publishedAt: 'x' });
    await store.putRemixSettings(off('quiet'));
    const gamesStore = {
      getSourceFile: async () =>
        '---\ntitle: Quiet\ngenre: puzzle\ncontrols: mouse\neditor: content\n---\nA calm game.',
      getDerivedArtifact: async () => null,
    } as unknown as GamesStore;
    const app = Fastify();
    await registerGamePageRoutes(app, { store, gamesStore });
    const page = await app.inject({ method: 'GET', url: '/api/games/quiet/page' });
    await app.close();
    expect(page.statusCode).toBe(200);
    expect(page.json().entry).toMatchObject({ slug: 'quiet', editor: 'content', remixOff: true });
  });
});
