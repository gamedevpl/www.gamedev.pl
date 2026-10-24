import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';
import type { GitHubClient } from './github-client.js';
import { registerCatalogRoutes } from './catalog-routes.js';
import { manifestTagline } from './catalog-tagline.js';

const description = {
  en: 'Perform trampoline flips, combine shapes and land upright to keep your routine going.',
  pl: 'Wykonuj salta na trampolinie, łącz figury i ląduj na nogach, aby kontynuować pokaz.',
};
const spec = '---\ntitle: Airtime\ngenre: arcade\ncontrols: Space\n---\n\nA trampoline show.';
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function fixture(enriched = false) {
  const store = new InMemoryStore();
  await store.setPublication({
    slug: 'airtime',
    state: 'published',
    currentVersion: 'live-v1',
    publishedAt: '2026-10-11T18:50:21.153Z',
  });
  if (enriched)
    await store.setCatalogEnrichment({
      slug: 'airtime',
      contentHash: 'h',
      tagline: { en: 'Generated hook.', pl: 'Wygenerowane hasło.' },
      shortControls: { en: 'Space', pl: 'Spacja' },
      searchKeywords: [],
      updatedAt: '2026-10-24T00:00:00Z',
    });
  const getSourceFile = vi.fn(async (_slug: string, _version: string, path: string) =>
    path === 'SPEC.md' ? spec : path === 'GAME.json' ? JSON.stringify({ description }) : null,
  );
  const gamesStore = {
    getSourceFile,
    getDerivedArtifact: async () => null,
    getManifest: async () => null,
  } as unknown as GamesStore;
  const app = Fastify();
  apps.push(app);
  await registerCatalogRoutes(app, {
    store,
    gamesStore,
    githubClient: {} as GitHubClient,
    now: () => 1000,
    mediaByIp: new Map(),
    maxMediaPerWindow: 100,
    mediaRateLimitWindowMs: 60000,
  });
  return { app, getSourceFile };
}

describe('catalog description fallback', () => {
  it('supplies Airtime Featured text from the published localized manifest without AI enrichment', async () => {
    const { app, getSourceFile } = await fixture();
    const first = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual([expect.objectContaining({ slug: 'airtime', tagline: description })]);
    expect(getSourceFile).toHaveBeenCalledWith('airtime', 'live-v1', 'GAME.json');
    await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(getSourceFile).toHaveBeenCalledTimes(2);
  });
  it('preserves generated catalog hooks when available', async () => {
    const { app } = await fixture(true);
    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.json()[0].tagline).toEqual({ en: 'Generated hook.', pl: 'Wygenerowane hasło.' });
  });
  it('keeps a published game listed when its optional manifest cannot be read', async () => {
    const { app, getSourceFile } = await fixture();
    getSourceFile.mockImplementation(async (_slug, _version, path) => {
      if (path === 'GAME.json') throw new Error('temporarily unavailable');
      return spec;
    });
    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([expect.objectContaining({ slug: 'airtime' })]);
  });
  it('normalizes legacy single-language descriptions and available locale fallback', () => {
    expect(manifestTagline('{"description":" A  trampoline show. "}')).toEqual({
      en: 'A trampoline show.',
      pl: 'A trampoline show.',
    });
    expect(manifestTagline('{"description":{"en":"","pl":" Pokaz "}}')).toEqual({ en: 'Pokaz', pl: 'Pokaz' });
  });
  it('ignores absent, malformed and non-text descriptions', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{}', '{"description":[]}', '{"description":{"en":123}}'])
      expect(manifestTagline(raw)).toBeUndefined();
  });
});
