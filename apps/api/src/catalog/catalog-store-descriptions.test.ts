import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { catalogEntryFromSpec, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import { withSnapshot } from './local-snapshot-reader.js';

const DESCRIPTION = 'Bounce on a trampoline, perform flips, and build your score.';
const SPEC = `---
title: Airtime
genre: Sports
controls: Space to jump; arrows to flip
---

# Concept

${DESCRIPTION}
`;

describe('store-published catalog descriptions', () => {
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

  it('serves SPEC prose without precomputed metadata or additional source reads and writes', async () => {
    const { app, store, getSourceFile } = await makeApp();
    const writeEnrichment = vi.spyOn(store, 'setCatalogEnrichment');

    for (let request = 0; request < 2; request += 1) {
      const response = await app.inject({ method: 'GET', url: '/api/catalog' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([{ slug: 'airtime', tagline: { en: DESCRIPTION, pl: DESCRIPTION } }]);
    }

    expect(getSourceFile).toHaveBeenCalledExactlyOnceWith('airtime', 'v1', 'SPEC.md');
    expect(writeEnrichment).not.toHaveBeenCalled();
  });

  it('prefers stored localized descriptions over the SPEC fallback', async () => {
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
    expect(response.json()[0].tagline).toEqual(tagline);
  });

  it('keeps descriptions absent when the SPEC only has headings and controls', async () => {
    const { app } = await makeApp({ spec: SPEC.replace(DESCRIPTION, '- Space to jump\n- Arrows to flip') });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).not.toHaveProperty('tagline');
  });

  it('preserves repo precedence without reading the shadowed store description', async () => {
    const repoEntry = catalogEntryFromSpec('airtime', SPEC.replace('Airtime', 'Repo Game'), () => null)!;
    const { app, getSourceFile } = await makeApp({ repoEntries: [repoEntry] });

    const response = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ slug: 'airtime', title: 'Repo Game' }]);
    expect(response.json()[0]).not.toHaveProperty('tagline');
    expect(getSourceFile).not.toHaveBeenCalled();
  });
});
