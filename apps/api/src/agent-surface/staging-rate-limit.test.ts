import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitHubClient } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import { mintAgentToken } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { mintUploadToken } from './agent-upload-token.js';

const SECRET = 'test-secret';
const ISSUE = 42;
const CONTENT = 'export {};';

describe('staging request headroom', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it.each(['json', 'raw', 'creator'] as const)(
    'stages 300 files after a rejected %s request and permits retries',
    async (mode) => {
      const staged = new Map<string, string>();
      const gamesStore = {
        getManifest: async () => null,
        getKitRegistry: async () => null,
        getSourceFile: async () => null,
        getStagedSourceFile: async ({ path }: { path: string }) => staged.get(path) ?? null,
        putStagedSourceFile: async ({ path, content }: { path: string; content: string }) => {
          staged.set(path, content);
          const files = [...staged].map(([path, content]) => ({ path, bytes: Buffer.byteLength(content) }));
          return {
            path,
            bytes: Buffer.byteLength(content),
            files,
            totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
            maxBytes: 5 * 1024 * 1024,
            maxFiles: 300,
            updatedAt: '2026-10-19T00:00:00.000Z',
          };
        },
      } as unknown as GamesStore;
      const store = new InMemoryStore();
      await store.upsertUser({ uid: 'g:owner' });
      await store.createSubmission(ISSUE, 'g:owner', 'Large game');
      await store.setSubmissionSlug(ISSUE, 'large-game');
      app = await buildApp({
        store,
        sessionSecret: 'dev-session-secret-change-me',
        submissionRoutes: {
          githubClient: {} as GitHubClient,
          githubToken: 'test-token',
          submissionTokenSecret: SECRET,
          agentChannel: { gamesStore },
        },
        creatorCodeRoutes: { store, gamesStore },
      });
      const stage = (path: string, valid = true) => {
        if (mode === 'creator') {
          return app!.inject({
            method: 'PUT',
            url: '/api/me/studio/games/large-game/sources/stage',
            headers: {
              cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:owner', 'dev-session-secret-change-me')}`,
            },
            payload: valid ? { path, content: CONTENT, rebuild: false } : {},
          });
        }
        const token =
          mode === 'json'
            ? mintAgentToken(ISSUE, SECRET, { roundGeneration: 1 })
            : mintUploadToken(SECRET, { jobId: ISSUE, roundGeneration: 1, kind: 'stage', path });
        return app!.inject({
          method: 'PUT',
          url: mode === 'json' ? '/api/agent/build/sources/stage' : '/api/agent/build/sources/stage/upload',
          headers: {
            authorization: `Bearer ${valid ? token : 'invalid-token'}`,
            'content-type': mode === 'json' ? 'application/json' : 'application/octet-stream',
          },
          payload: mode === 'json' ? { path, content: CONTENT } : Buffer.from(CONTENT),
        });
      };

      expect((await stage('game/module-0.ts', false)).statusCode).toBe(mode === 'creator' ? 400 : 401);
      for (let index = 0; index < 300; index++) {
        const response = await stage(`game/module-${index}.ts`);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().accepted).toBe(true);
      }
      expect(staged.size).toBe(300);
      expect((await stage('game/module-0.ts')).statusCode).toBe(200);
      for (let used = 302; used < 600; used++) {
        expect((await stage('game/module-0.ts')).statusCode).toBe(200);
      }
      expect((await stage('game/module-0.ts')).statusCode).toBe(429);
    },
  );
});
