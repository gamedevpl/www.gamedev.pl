import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { OPENAI_APPS_CHALLENGE_PATH, resolveOpenAiAppsChallengeToken } from './openai-apps-challenge.js';
import { InMemoryStore } from './store.js';

describe(`GET ${OPENAI_APPS_CHALLENGE_PATH}`, () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
    delete process.env.PRIVATE_BETA;
    if (app) await app.close();
    app = undefined;
  });

  async function build() {
    return buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
  }

  it('serves the token as plain text so the portal can read it verbatim', async () => {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = 'token-from-the-submission-portal';
    app = await build();
    const res = await app.inject({ method: 'GET', url: OPENAI_APPS_CHALLENGE_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.body).toBe('token-from-the-submission-portal');
  });

  /**
   * An empty body would satisfy the route and fail verification with no clue why. A 404
   * says plainly that nothing is configured.
   */
  it('404s rather than serving an empty body when no token is configured', async () => {
    app = await build();
    const res = await app.inject({ method: 'GET', url: OPENAI_APPS_CHALLENGE_PATH });
    expect(res.statusCode).toBe(404);
  });

  /**
   * A stale token outlives the submission it proves, and the portal re-fetches on demand.
   */
  it('forbids caching', async () => {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = 'abc123';
    app = await build();
    const res = await app.inject({ method: 'GET', url: OPENAI_APPS_CHALLENGE_PATH });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  /**
   * Well-known paths sit outside `/api/`, so the wall never sees them. Asserted because
   * the verification fetch is unauthenticated by definition — OpenAI has no session.
   */
  it('is reachable without a session while the private beta is on', async () => {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = 'beta-token';
    process.env.PRIVATE_BETA = 'true';
    app = await build();
    const res = await app.inject({ method: 'GET', url: OPENAI_APPS_CHALLENGE_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('beta-token');
  });

  it('trims surrounding whitespace, which a copy-paste from the portal can carry', () => {
    expect(resolveOpenAiAppsChallengeToken({ token: '  padded-token \n' })).toBe('padded-token');
  });
});
