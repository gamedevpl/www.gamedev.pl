import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mintAgentToken } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { validateSourceUpload, type GamesStore } from '../delivery/games-store.js';
import { InMemoryStore } from '../platform/store.js';

const secret = 'test-secret';
const JOB = 42;
const HOW_TO_PLAY = { goal: { en: 'Survive', pl: 'Przetrwaj' }, hint: { en: 'Keep moving', pl: 'Nie stój' } };

function files(modules: string[]) {
  return [
    { path: 'SPEC.md', content: '---\ntitle: A game\n---\n' },
    { path: 'game.ts', content: 'export {};' },
    { path: 'AGENT.json', content: '{"policy":"capture"}' },
    { path: 'GAME.json', content: JSON.stringify({ engine: { modules }, howToPlay: HOW_TO_PLAY }) },
  ];
}

describe('submit_sources and GAME.json engine.modules order', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  // 2026-11-27: two builds appended `rng`; the gate refused both.
  it('delivers a misordered module list in kit order', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.createSubmission(JOB, 'g:owner', 'Squad game');
    const stored: Array<{ files: Array<{ path: string; content: string }> }> = [];
    const gamesStore = {
      putCandidateSources: async (input: { files: Array<{ path: string; content: string }> }) => {
        stored.push(input);
        return { version: 'v1', manifest: {} as never };
      },
    } as unknown as GamesStore;
    app = await buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubClient: {} as GitHubClient,
        githubToken: 'gh-token',
        submissionTokenSecret: secret,
        agentChannel: { gamesStore },
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: { authorization: `Bearer ${mintAgentToken(JOB, secret, { roundGeneration: 1 })}` },
      payload: {
        slug: 'comet-courier',
        files: files(['rng', 'input']),
        kitEngineRef: 'abcdef1234567890',
        mode: 'preview',
      },
    });
    expect(response.statusCode).toBe(200);
    const game = stored[0]!.files.find((file) => file.path === 'GAME.json')!;
    expect(JSON.parse(game.content).engine.modules).toEqual(['input', 'rng']);
  });

  // The gate cannot repair a duplicate, so submit refuses it.
  it('refuses a duplicate module and keeps the staging buffer', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.createSubmission(JOB, 'g:owner', 'Squad game');
    let cleared = 0;
    const gamesStore = {
      putCandidateSources: async (input: { files: Array<{ path: string; content: string }> }) => {
        validateSourceUpload(input.files, 'preview');
        return { version: 'v1', manifest: {} as never };
      },
      getStagedSourceFiles: async () => files(['input', 'input']),
      clearStagedSources: async () => ({ cleared: ++cleared }),
      getManifest: async () => null,
    } as unknown as GamesStore;
    app = await buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubClient: {} as GitHubClient,
        githubToken: 'gh-token',
        submissionTokenSecret: secret,
        agentChannel: { gamesStore },
      },
    });
    const submit = (payload: Record<string, unknown>) =>
      app!.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: { authorization: `Bearer ${mintAgentToken(JOB, secret, { roundGeneration: 1 })}` },
        payload: { slug: 'comet-courier', kitEngineRef: 'abcdef1234567890', mode: 'preview', ...payload },
      });
    const staged = await submit({ fromStaged: true });
    expect(staged.statusCode).toBe(400);
    expect(staged.json()).toMatchObject({ reason: 'game_manifest_invalid' });
    expect(staged.json().error).toContain('duplicate');
    expect(staged.json().retry).toContain('stay staged');
    expect(cleared).toBe(0);
    const inline = await submit({ files: files(['input', 'input']) });
    expect(inline.statusCode).toBe(400);
    expect(inline.json().retry).toContain('Send the whole set again');
  });
});
