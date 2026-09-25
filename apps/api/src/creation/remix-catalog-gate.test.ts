import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRemixRoutes, MAX_REMIX_ID_LENGTH } from './remix.js';
import { InMemoryStore } from '../platform/store.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { openProposal } from '../community/proposals.js';

// Repo-lane remix is gated on live catalog membership, before repo reads.

const alice = { 'x-test-uid': 'g:alice' };
const FILES: Record<string, string> = { 'GAME.json': '{"engine":{"modules":[]}}' };

// Every method records its name, so refusals can prove no reads.
function spyClient(calls: string[]): GitHubClient {
  const answers: Record<string, (...args: string[]) => unknown> = {
    getGameFile: (_ref, _slug, path) => FILES[path] ?? null,
    getGameSourceMap: () => ({ 'game.ts': 'export {};' }),
    getGameDeliverySources: () => ({ ...FILES }),
    getGameSources: () => null,
    getGameKitDeclaration: () => null,
    getRefSha: () => 'refsha1',
  };
  return new Proxy({} as GitHubClient, {
    get(_target, property) {
      const answer = answers[String(property)];
      if (!answer) return undefined;
      return async (...args: string[]) => {
        calls.push(String(property));
        return answer(...args);
      };
    },
  });
}

describe('remix catalog gate', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    delete process.env.CODE_LANE;
    if (app) await app.close();
    app = null;
  });

  async function build(lookup: ((slug: string) => Promise<object | null>) | undefined, calls: string[]) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    const instance = Fastify({ routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH } });
    instance.decorateRequest('user', null);
    instance.addHook('onRequest', async (request) => {
      const uid = request.headers['x-test-uid'];
      (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
    });
    await registerRemixRoutes(instance, {
      store,
      openProposal,
      githubClient: spyClient(calls),
      ...(lookup ? { getRepoPublishedCatalogEntry: lookup } : {}),
      publishedRef: 'main',
      codeLane: { run: async () => ({ ok: true }) } as never,
    });
    await instance.ready();
    return instance;
  }

  const start = (instance: FastifyInstance) =>
    instance.inject({ method: 'POST', url: '/api/games/repo-game/remix', headers: alice });

  it('refuses a slug absent from the catalog without reading the repo', async () => {
    const calls: string[] = [];
    app = await build(async () => null, calls);

    const response = await start(app);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'game not found' });
    expect(calls).toEqual([]);
  });

  it('fails closed when the catalog cannot answer or is not wired', async () => {
    const calls: string[] = [];
    app = await build(async () => {
      throw new Error('snapshot unavailable');
    }, calls);
    expect((await start(app)).statusCode).toBe(404);
    await app.close();

    app = await build(undefined, calls);
    expect((await start(app)).statusCode).toBe(404);
    expect(calls).toEqual([]);
  });

  it('closes an open session once its game leaves the catalog', async () => {
    process.env.CODE_LANE = 'true';
    const calls: string[] = [];
    let listed = true;
    app = await build(async () => (listed ? {} : null), calls);
    const opened = await start(app);
    expect(opened.statusCode).toBe(200);
    const { remixId } = opened.json();
    listed = false;
    calls.length = 0;

    const code = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'add a double jump' },
    });
    const view = await app.inject({ method: 'GET', url: `/api/remixes/${remixId}`, headers: alice });

    expect(code.statusCode).toBe(404);
    expect(view.statusCode).toBe(404);
    expect(calls).toEqual([]);
  });
});
