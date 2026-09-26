import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerEditorRoutes } from './editor-drafts.js';
import { textFields } from './editor-draft-texts.js';
import { parseEditorDefinition } from './editor-contract.js';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';

const label = { en: 'Layer', pl: 'Warstwa' };
const declaration = {
  version: 2,
  content: {
    levels: {
      widget: 'collection',
      label,
      itemLabel: label,
      min: 1,
      max: 4,
      item: {
        widget: 'layered',
        properties: {},
        constraints: [],
        layers: {
          terrain: {
            widget: 'tilemap',
            label,
            properties: { caption: { type: 'text', max: 40 } },
            grid: { minCols: 1, maxCols: 4, minRows: 1, maxRows: 4 },
            tiles: [
              { key: 'empty', char: '.', label },
              { key: 'wall', char: '#', label },
            ],
            constraints: [],
          },
          actors: {
            widget: 'entities',
            label,
            min: 0,
            max: 4,
            properties: { speech: { type: 'text', max: 40 } },
            constraints: [],
          },
        },
      },
    },
  },
};
const content = {
  levels: [
    {
      properties: {},
      layers: {
        terrain: { properties: { caption: 'blocked caption' }, rows: ['.'] },
        actors: [{ properties: { speech: 'blocked text' } }],
      },
    },
  ],
};

describe('nested editor layer moderation', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('finds tilemap and entity text when the parent has no text properties', () => {
    const { definition, errors } = parseEditorDefinition(JSON.stringify(declaration));
    expect(errors).toEqual([]);
    expect(textFields(definition!, content)).toEqual(['blocked caption', 'blocked text']);
  });

  it('refuses nested text before a draft reaches storage', async () => {
    vi.stubEnv('EDITORKIT_V2', 'true');
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, 'g:owner', 'Nested game');
    await store.setSubmissionSlug(jobId, 'nested-game');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');
    const app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.user = (await store.getUser('g:owner'))!;
    });
    const checkFields = vi.fn(async () => ({ allowed: false, category: 'hate' as const }));
    await registerEditorRoutes(app, {
      store,
      gamesStore: {
        getSourceFile: async (_slug: string, _version: string, path: string) =>
          JSON.stringify(path === 'EDITOR.json' ? declaration : content),
      } as unknown as GamesStore,
      contentChecker: { checkFields, check: checkFields },
    });
    try {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/me/games/nested-game/editor/draft',
        payload: { content },
      });
      expect(response.statusCode).toBe(422);
      expect(checkFields).toHaveBeenCalledWith(['blocked caption', 'blocked text']);
      expect(await store.getEditorDraft('g:owner', 'nested-game')).toBeNull();
    } finally {
      await app.close();
    }
  });
  it.each([
    { verdict: { allowed: false as const, category: 'hate' as const }, status: 422 },
    { verdict: { allowed: false as const, unavailable: true }, status: 503 },
  ])('rechecks legacy stored drafts before publication: $status', async ({ verdict, status }) => {
    vi.stubEnv('EDITORKIT_V2', 'true');
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.createSubmission(17, 'g:owner', 'Nested game');
    await store.setSubmissionSlug(17, 'nested-game');
    await store.setSubmissionDeliveredVersion(17, 'v1');
    await store.putEditorDraft('g:owner', 'nested-game', JSON.stringify(content));
    const app = Fastify();
    app.addHook('onRequest', async (request) => {
      request.user = (await store.getUser('g:owner'))!;
    });
    const checkFields = vi.fn(async () => verdict);
    const getManifest = vi.fn(async () => null);
    const putCandidateSources = vi.fn();
    await registerEditorRoutes(app, {
      store,
      gamesStore: {
        getSourceFile: async (_slug: string, _version: string, path: string) =>
          JSON.stringify(path === 'EDITOR.json' ? declaration : content),
        getManifest,
        putCandidateSources,
      } as unknown as GamesStore,
      contentChecker: { checkFields, check: checkFields },
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/me/games/nested-game/editor/publish' });
      expect(response.statusCode).toBe(status);
      expect(checkFields).toHaveBeenCalledWith(['blocked caption', 'blocked text']);
      expect(getManifest).not.toHaveBeenCalled();
      expect(putCandidateSources).not.toHaveBeenCalled();
      expect(await store.getSubmissionBySlug('nested-game')).toMatchObject({ jobId: 17, deliveredVersion: 'v1' });
    } finally {
      await app.close();
    }
  });
});
