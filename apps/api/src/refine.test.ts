import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { PatternChecker } from './moderation.js';
import { StubSpecRefiner } from './refine.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

async function createAuthenticatedApp(stubRefinerResponse?: Parameters<typeof StubSpecRefiner.prototype.refine>[0]) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  const specRefiner = new StubSpecRefiner(
    stubRefinerResponse ?? {
      questions: [
        {
          id: 'visual_style',
          question: 'What visual style do you prefer?',
          options: [
            { label: 'Pixel Art', detail: '8-bit retro graphics' },
            { label: 'Neon Arcade', detail: 'Glowing vector lines on dark background' },
          ],
          allowFreeText: true,
        },
      ],
    },
  );

  const app = await buildApp({
    store,
    sessionSecret,
    specRefiner,
    contentChecker: new PatternChecker(),
  });

  const token = mintSessionToken('g:test-user', sessionSecret);
  const authHeaders = { cookie: `${SESSION_COOKIE_NAME}=${token}` };
  return { app, store, authHeaders };
}

describe('POST /api/submissions/refine', () => {
  let app: FastifyInstance;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    const setup = await createAuthenticatedApp();
    app = setup.app;
    authHeaders = setup.authHeaders;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      payload: {
        title: 'Sky Dodge',
        concept: 'Dodge the falling rocks and survive as long as possible in a 2D canvas arena',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns questions for valid authenticated request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: authHeaders,
      payload: {
        title: 'Sky Dodge',
        concept: 'Dodge the falling rocks and survive as long as possible in a 2D canvas arena',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].id).toBe('visual_style');
    expect(body.questions[0].options).toHaveLength(2);
  });

  it('rejects moderation-failing requests with 422 before calling refiner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: authHeaders,
      payload: {
        title: 'Sky Dodge',
        concept: 'this game is fucking stupid and terrible dodge falling rocks',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('content_rejected');
  });

  it('fails open (returns 200 with empty questions) when refiner throws an error', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    const throwingRefiner = {
      refine: async () => {
        throw new Error('Vertex AI network failure');
      },
    };
    const testApp = await buildApp({
      store,
      sessionSecret,
      specRefiner: throwingRefiner,
      contentChecker: new PatternChecker(),
    });
    const token = mintSessionToken('g:test-user', sessionSecret);

    const res = await testApp.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      payload: {
        title: 'Clean Game',
        concept: 'A completely clean game concept that should fail open if LLM fails',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ questions: [] });
    await testApp.close();
  });
});
