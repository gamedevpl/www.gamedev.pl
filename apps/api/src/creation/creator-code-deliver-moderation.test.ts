import { Writable } from 'node:stream';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseSpecTitle } from '../catalog/github-client.js';
import { createGcsGamesStore, type GamesStore } from '../delivery/games-store.js';
import { createSourceDeliveryService } from '../delivery/source-delivery.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { VertexChecker } from '../platform/moderation.js';
import { InMemoryStore } from '../platform/store.js';
import {
  runTypecheckPreflight,
  sharedSourcesFromKitTree,
  TYPECHECK_PREFLIGHT_MAX_REFUSALS,
} from './typecheck-preflight.js';

const sessionSecret = 'dev-session-secret-change-me';
const submissionTokenSecret = 'test-submission-secret';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function stubGcs() {
  const objects = new Map<string, Buffer>();
  const generations = new Map<string, number>();
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const parsed = new URL(href);
      const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
      const ifMatch = parsed.searchParams.get('ifGenerationMatch');
      const current = generations.get(name) ?? 0;
      if (ifMatch !== null && Number(ifMatch) !== current) {
        return new Response('Precondition Failed', { status: 412 });
      }
      objects.set(name, Buffer.from(init.body as Uint8Array));
      const next = current + 1;
      generations.set(name, next);
      return new Response(JSON.stringify({ generation: String(next) }), { status: 200 });
    }
    if (init.method === 'DELETE') {
      const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
      objects.delete(name);
      generations.delete(name);
      return new Response(null, { status: 200 });
    }
    if (!href.includes('/o/')) {
      const parsed = new URL(href);
      const prefix = parsed.searchParams.get('prefix') ?? '';
      const prefixes = new Set<string>();
      for (const name of objects.keys()) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash !== -1) prefixes.add(`${prefix}${rest.slice(0, slash + 1)}`);
      }
      return new Response(JSON.stringify({ prefixes: [...prefixes] }), { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    const generation = String(generations.get(name) ?? 1);
    return new Response(new Uint8Array(body), { status: 200, headers: { 'x-goog-generation': generation } });
  }) as unknown as typeof fetch;
  return { impl, objects, generations };
}

function gamesStore(): GamesStore {
  const { impl } = stubGcs();
  return createGcsGamesStore({ bucket: 'b', getAccessToken: async () => 'token', fetchImpl: impl });
}

describe('POST /api/me/studio/games/:slug/sources/deliver moderation', () => {
  let store: InMemoryStore;
  let games: GamesStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    games = gamesStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.upsertUser({ uid: 'g:other' });
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
  });

  it('returns a moderation refusal when the model errors, instead of 500', async () => {
    const lines: string[] = [];
    const log = pino(
      { level: 'warn' },
      new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      }),
    );
    const sourceDelivery = createSourceDeliveryService({
      store,
      gamesStore: games,
      log,
      contentChecker: new VertexChecker({
        retryDelayMs: 0,
        timeoutMs: 1_000,
        vertexFetcher: async () => {
          const error = new Error('429 You have no credits remaining');
          error.name = 'RateLimitError';
          throw error;
        },
      }),
      onSourcesDelivered: async () => ({ buildId: 'b1' }),
      parseSpecTitle,
      runTypecheckPreflight,
      sharedSourcesFromKitTree,
      typecheckPreflightMaxRefusals: TYPECHECK_PREFLIGHT_MAX_REFUSALS,
    });
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret,
        agentChannel: { gamesStore: games },
      },
      creatorCodeRoutes: { store, gamesStore: games, sourceDelivery },
    });
    try {
      const stage = (path: string, content: string) =>
        games.putStagedSourceFile({
          slug: 'sky-dodge',
          jobId: 10,
          roundGeneration: 1,
          path,
          content,
          stagedBy: 'owner',
        });
      await stage('SPEC.md', '---\ntitle: Sky Dodge\n---\nDodge the sky.');
      await stage(
        'GAME.json',
        JSON.stringify({
          title: { en: 'Sky Dodge', pl: 'Unik' },
          howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
        }),
      );
      await stage('game.ts', 'export const boot = () => {};');

      const res = await app.inject({
        method: 'POST',
        url: '/api/me/studio/games/sky-dodge/sources/deliver',
        headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
        payload: { mode: 'preview', attestation: true },
      });

      expect(res.statusCode).not.toBe(500);
      expect(res.json()).toMatchObject({
        accepted: false,
        rejected: 'moderation_unavailable',
        retryAfterSeconds: 60,
      });
      expect(lines.join('')).toContain('moderation unavailable');
    } finally {
      await app.close();
    }
  });
});
