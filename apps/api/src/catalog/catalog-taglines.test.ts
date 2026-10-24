import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { catalogEntryFromSpec, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import { withSnapshot } from './local-snapshot-reader.js';
import {
  attachCatalogEnrichment,
  attachCatalogEnrichments,
  enrichCatalogEntries,
  getOrEnrichCatalogGame,
} from './catalog-enricher.js';

const DESCRIPTION = 'Bounce on a trampoline, perform flips, and build your score.';
const TAGLINE = { en: 'One button, bigger flips — stick the landing.', pl: 'Jeden przycisk — wyląduj na nogach.' };
const SPEC = `---
title: Airtime
genre: Sports
tagline_en: ${TAGLINE.en}
tagline_pl: ${TAGLINE.pl}
controls: Space to jump; arrows to flip
---

# Concept

${DESCRIPTION}
`;

describe('authored store-published catalog taglines', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function makeApp(options: { spec?: string; repoEntries?: CatalogGameEntry[] } = {}) {
    const store = new InMemoryStore();
    await store.setPublication({
      slug: 'airtime',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-10-24T00:00:00.000Z',
    });
    const getSourceFile = vi.fn().mockResolvedValue(options.spec ?? SPEC);
    const gamesStore = {
      getSourceFile,
      getDerivedArtifact: async () => null,
      getManifest: async () => null,
    } as unknown as GamesStore;
    const app = await buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubToken: 'token',
        submissionTokenSecret: 'test-submission-secret',
        agentChannel: { gamesStore },
        ...withSnapshot({ getCatalog: async () => options.repoEntries ?? [] } as unknown as GitHubClient),
      },
    });
    apps.push(app);
    return { app, store, getSourceFile };
  }

  it('serves authored taglines without precomputed enrichment or additional source reads and writes', async () => {
    const { app, store, getSourceFile } = await makeApp();
    const writeEnrichment = vi.spyOn(store, 'setCatalogEnrichment');

    for (let request = 0; request < 2; request += 1) {
      const response = await app.inject({ method: 'GET', url: '/api/catalog' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([{ slug: 'airtime', tagline: TAGLINE }]);
      expect(response.json()[0].tagline.en).not.toBe(DESCRIPTION);
    }

    expect(getSourceFile).toHaveBeenCalledExactlyOnceWith('airtime', 'v1', 'SPEC.md');
    expect(writeEnrichment).not.toHaveBeenCalled();
  });

  it('keeps authored taglines ahead of stored generated enrichment', async () => {
    const { app, store } = await makeApp();
    const tagline = { en: 'Flip your way to a new record.', pl: 'Skacz po nowy rekord.' };
    await store.setCatalogEnrichment({
      slug: 'airtime',
      contentHash: 'fixture',
      tagline,
      shortControls: { en: 'Space + arrows', pl: 'Spacja + strzałki' },
      searchKeywords: ['trampoline'],
      updatedAt: '2026-10-24T00:00:00.000Z',
    });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].tagline).toEqual(TAGLINE);
  });

  it('preserves a single supplied language without adding design prose as a translation', async () => {
    const { app } = await makeApp({ spec: SPEC.replace(/^tagline_pl:.*\n/gm, '') });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0].tagline).toEqual({ en: TAGLINE.en });
  });

  it('preserves authored text across bulk enrichment and cold or cached single-game reads', async () => {
    const store = new InMemoryStore();
    const partialSpec = SPEC.replace(/^tagline_pl:.*\n/gm, '');
    const entry = catalogEntryFromSpec('airtime', partialSpec, () => null)!;
    const generated = await getOrEnrichCatalogGame(entry, partialSpec, { store, genAIClient: null });
    const t0 = 9_000_000;

    const cold = await attachCatalogEnrichment(entry, store, t0);
    const [catalog] = await attachCatalogEnrichments([entry], store, t0);
    const warm = await attachCatalogEnrichment(entry, store, t0 + 1_000);
    const [enriched] = await enrichCatalogEntries([entry], async () => partialSpec, { store, genAIClient: null });

    for (const result of [cold, catalog, warm, enriched]) {
      expect(result?.tagline).toEqual({ en: TAGLINE.en, pl: generated.tagline.pl });
      expect(result?.shortControls?.en).toBe(generated.shortControls.en);
    }
  });

  it('does not use design prose or controls when the SPEC has no authored tagline', async () => {
    const { app } = await makeApp({ spec: SPEC.replace(/^tagline_(en|pl):.*\n/gm, '') });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).not.toHaveProperty('tagline');
  });

  it('preserves repo taglines without reading the shadowed store metadata', async () => {
    const repoSpec = SPEC.replace('Airtime', 'Repo Game').replace(TAGLINE.en, 'A hook from the repo.');
    const repoEntry = catalogEntryFromSpec('airtime', repoSpec, () => null)!;
    const { app, getSourceFile } = await makeApp({ repoEntries: [repoEntry] });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ slug: 'airtime', title: 'Repo Game' }]);
    expect(response.json()[0].tagline).toEqual({ ...TAGLINE, en: 'A hook from the repo.' });
    expect(getSourceFile).not.toHaveBeenCalled();
  });
});
