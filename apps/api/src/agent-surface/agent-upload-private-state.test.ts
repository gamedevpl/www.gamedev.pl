import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintUploadToken, type UploadKind } from './agent-upload-token.js';
import { BEHAVIOURAL_CONTRACT } from './mcp-tool-support.js';

const secret = 'test-secret';
const ISSUE = 77;
const SECRET_TEXT = 'private creator note: the boss is behind the waterfall';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function stubGitHub(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

function stubGamesStore(): GamesStore {
  const staged = new Map<string, { path: string; content: string; bytes: number }>();
  const summary = () => {
    const files = [...staged.values()].map((f) => ({ path: f.path, bytes: f.bytes }));
    const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
    return { files, totalBytes, maxBytes: 1_500_000, maxFiles: 64 };
  };
  return {
    getManifest: async () => null,
    getKitRegistry: async () => null,
    getSourceFile: async () => null,
    putStagedSourceFile: async (input: { path: string; content: string }) => {
      const bytes = Buffer.byteLength(input.content, 'utf8');
      staged.set(input.path, { path: input.path, content: input.content, bytes });
      return { path: input.path, bytes, ...summary(), updatedAt: new Date().toISOString() };
    },
    getStagedSourceFiles: async () => [...staged.values()].map((f) => ({ path: f.path, content: f.content })),
    getStagedSourceFile: async (input: { path: string }) => staged.get(input.path)?.content ?? null,
    listStagedSources: async () => summary(),
  } as unknown as GamesStore;
}

async function createApp(store: InMemoryStore) {
  return await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      agentChannel: { gamesStore: stubGamesStore() },
    },
  });
}

async function seedJob(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Waterfall Quest');
  await store.setSubmissionSlug(ISSUE, 'waterfall-quest');
  await store.setSubmissionLocale(ISSUE, 'en');
  await store.appendCreatorMessage(ISSUE, SECRET_TEXT);
}

const UPLOADS: Record<UploadKind, { url: string; path?: string; body: Buffer }> = {
  stage: {
    url: '/api/agent/build/sources/stage/upload',
    path: 'game/extra.ts',
    body: Buffer.from('export const extra = 1;\n'),
  },
  screenshot: { url: '/api/agent/build/shot/upload', body: TINY_PNG },
};

async function put(app: FastifyInstance, kind: UploadKind) {
  const upload = UPLOADS[kind];
  const token = mintUploadToken(secret, {
    jobId: ISSUE,
    roundGeneration: 1,
    kind,
    ...(upload.path ? { path: upload.path } : {}),
  });
  return await app.inject({
    method: 'PUT',
    url: upload.url,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
    payload: upload.body,
  });
}

// An upload-only capability must never read the creator's private channel.
describe('upload capabilities and channel state', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  for (const kind of ['stage', 'screenshot'] as const) {
    it(`leaves pending creator messages out of an accepted ${kind} upload`, async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      app = await createApp(store);

      const response = await put(app, kind);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ accepted: true });
      expect(response.body).not.toContain(SECRET_TEXT);
      expect(response.json()).not.toHaveProperty('pending');
      expect(response.json()).not.toHaveProperty('gate');
      expect(response.json()).not.toHaveProperty('control');
    });

    it(`leaves pending creator messages out of a stopped ${kind} upload`, async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      await store.setSubmissionAbandoned(ISSUE, new Date().toISOString());
      app = await createApp(store);

      const response = await put(app, kind);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ accepted: false, rejected: 'stopped' });
      expect(response.body).not.toContain(SECRET_TEXT);
    });
  }

  it('never shows the model a headerless upload command', () => {
    const uploads = BEHAVIOURAL_CONTRACT.split('curl ')
      .slice(1)
      .filter((command) => command.slice(0, 200).includes('--upload-file'));
    expect(uploads.length).toBeGreaterThan(0);
    for (const command of uploads) expect(command).toMatch(/^-H "Authorization: Bearer /);
  });
});
