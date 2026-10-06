import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';
import { registerGamePageRoutes } from './game-page-routes.js';
import { attachRemixOn, invalidateRemixOnSlugs } from './remix-on.js';

const on = (slug: string) => ({ slug, mode: 'on' as const, updatedAt: 'x' });

const gamesStore = {
  getSourceFile: async () => '---\ntitle: Open\ngenre: puzzle\ncontrols: mouse\neditor: content\n---\nA calm game.',
  getDerivedArtifact: async () => null,
} as unknown as GamesStore;

async function pageEntry(store: InMemoryStore): Promise<Record<string, unknown>> {
  await store.setPublication({ slug: 'open', state: 'published', currentVersion: 'v1', publishedAt: 'x' });
  const app = Fastify();
  await registerGamePageRoutes(app, { store, gamesStore });
  const page = await app.inject({ method: 'GET', url: '/api/games/open/page' });
  await app.close();
  expect(page.statusCode).toBe(200);
  return page.json().entry;
}

describe('remixOn on game data', () => {
  it('flags only switched-on entries in the catalog', async () => {
    const store = new InMemoryStore();
    expect(await attachRemixOn([{ slug: 'open' }], store, 1)).toEqual([{ slug: 'open' }]);
    await store.putRemixSettings(on('open'));
    await store.putRemixSettings({ ...on('quiet'), mode: 'off' });
    invalidateRemixOnSlugs(store);
    const entries = await attachRemixOn([{ slug: 'open' }, { slug: 'quiet' }, { slug: 'unset' }], store, 2);
    expect(entries).toEqual([{ slug: 'open', remixOn: true }, { slug: 'quiet' }, { slug: 'unset' }]);
  });

  it('carries remixOn on the game page entry only when on', async () => {
    const unset = await pageEntry(new InMemoryStore());
    expect(unset).toMatchObject({ slug: 'open', editor: 'content' });
    expect(unset).not.toHaveProperty('remixOn');

    const store = new InMemoryStore();
    await store.putRemixSettings(on('open'));
    expect(await pageEntry(store)).toMatchObject({ slug: 'open', editor: 'content', remixOn: true });
  });
});
