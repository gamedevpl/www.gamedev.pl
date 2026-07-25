import type { FastifyInstance } from 'fastify';
import { genaicode } from 'genaicode';
import type { GenerationRequest } from 'genaicode';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { PatternChecker } from './moderation.js';
import { DEFAULT_REFINE_TIMEOUT_MS, StubSpecRefiner, VertexSpecRefiner } from './refine.js';
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

describe('VertexSpecRefiner over a genaicode client', () => {
  function stubClient(responseText: string, capture?: (request: GenerationRequest) => void) {
    return genaicode({
      name: 'stub',
      async generate(request) {
        capture?.(request);
        return { parts: [{ type: 'text' as const, text: responseText }] };
      },
    });
  }

  it('normalizes questions and caps them at four', async () => {
    let seen: GenerationRequest | undefined;
    const questions = Array.from({ length: 6 }, (_, i) => ({
      id: `q${i}`,
      question: `Question ${i}?`,
      options: [{ label: 'A', detail: 'first' }],
    }));
    const refiner = new VertexSpecRefiner({
      client: stubClient(JSON.stringify({ questions }), (req) => (seen = req)),
    });

    const result = await refiner.refine({ title: 'Carrot Farm', concept: 'Grow carrots', locale: 'pl' });

    expect(result.questions).toHaveLength(4);
    expect(result.questions[0]).toEqual({
      id: 'q0',
      question: 'Question 0?',
      options: [{ label: 'A', detail: 'first' }],
      allowFreeText: true,
    });
    expect(seen?.temperature).toBe(0.2);
    expect(seen?.prompt[0]?.text).toContain('Carrot Farm');
    expect(seen?.prompt[0]?.text).toContain('(pl)');
  });

  it('fills defaults for partial question objects', async () => {
    const refiner = new VertexSpecRefiner({
      client: stubClient('{"questions": [{"allowFreeText": false}]}'),
    });

    const result = await refiner.refine({ title: 'Game', concept: 'Concept' });

    expect(result.questions).toEqual([{ id: 'q_0', question: '', options: [], allowFreeText: false }]);
  });

  it('fails open when the call outruns its abort budget', async () => {
    // The production failure mode this guards: the model answers, just not within
    // the budget, so the request aborts and the creator silently gets no questions.
    const refiner = new VertexSpecRefiner({
      timeoutMs: 20,
      client: genaicode({
        name: 'hangs',
        generate: (request) =>
          new Promise((_resolve, reject) => {
            request.signal?.addEventListener('abort', () => reject(request.signal?.reason));
          }),
      }),
    });

    expect(await refiner.refine({ title: 'Game', concept: 'Concept' })).toEqual({ questions: [] });
  });

  it('budgets far more time than the one-token moderation call', () => {
    // 5s was the old default and it aborted every real production attempt. Keeping
    // this floor explicit so the budget is not quietly tightened back to it.
    expect(DEFAULT_REFINE_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });

  it('fails open on a malformed or non-conforming response', async () => {
    for (const body of ['not json at all', '', '{"questions": "nope"}']) {
      const refiner = new VertexSpecRefiner({ client: stubClient(body) });
      expect(await refiner.refine({ title: 'Game', concept: 'Concept' })).toEqual({ questions: [] });
    }
  });
});
