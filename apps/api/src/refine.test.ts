import type { FastifyInstance } from 'fastify';
import { genaicode } from 'genaicode';
import type { GenerationRequest } from 'genaicode';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import { PatternChecker } from './platform/moderation.js';
import { DEFAULT_REFINE_TIMEOUT_MS, StubSpecRefiner, VertexSpecRefiner } from './refine.js';
import { InMemoryStore } from './platform/store.js';

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

  it('fails closed (returns 502) when refiner throws an error', async () => {
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
        concept: 'A completely clean game concept that should surface an error if the LLM fails',
      },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'refine_unavailable' });
    await testApp.close();
  });

  it('serves a repeated spec from cache, spending neither quota nor a refiner call', async () => {
    // Dismissing the panel and resubmitting, or double-clicking, used to cost a slot
    // out of twenty for questions we had already written.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    let refinerCalls = 0;
    const countingRefiner = {
      refine: async () => {
        refinerCalls += 1;
        return { questions: [{ id: 'style', question: 'Which style?', options: [{ label: 'Pixel' }] }] };
      },
    };
    const testApp = await buildApp({
      store,
      sessionSecret,
      specRefiner: countingRefiner,
      contentChecker: new PatternChecker(),
    });
    const token = mintSessionToken('g:test-user', sessionSecret);
    const payload = { title: 'Repeat Game', concept: 'The very same concept text submitted twice in a row' };

    const first = await testApp.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      payload,
    });
    const second = await testApp.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      payload,
    });

    expect(first.json()).toEqual(second.json());
    expect(refinerCalls).toBe(1);
    expect((await store.getUsage('g:test-user', new Date().toISOString().slice(0, 10))).refines).toBe(1);

    // A genuinely different concept is not a repeat, and must still be answered.
    await testApp.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      payload: { ...payload, concept: 'A different concept entirely, deserving its own questions' },
    });
    expect(refinerCalls).toBe(2);

    await testApp.close();
  });

  it('gives a bot account the automation ceiling, so the deploy gate cannot lock the pipeline out', async () => {
    const previous = {
      human: process.env.DAILY_REFINE_QUOTA,
      bot: process.env.DAILY_REFINE_QUOTA_BOT,
    };
    process.env.DAILY_REFINE_QUOTA = '1';
    process.env.DAILY_REFINE_QUOTA_BOT = '3';

    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    await store.upsertUser({ uid: 'bot:e2e' });
    const testApp = await buildApp({
      store,
      sessionSecret,
      specRefiner: new StubSpecRefiner({
        questions: [{ id: 'style', question: 'Which style?', options: [{ label: 'Pixel' }] }],
      }),
      contentChecker: new PatternChecker(),
    });

    // Distinct concepts: a repeat is cache-served and proves nothing.
    const refine = (uid: string, concept: string) =>
      testApp.inject({
        method: 'POST',
        url: '/api/submissions/refine',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` },
        payload: { concept },
      });

    expect((await refine('g:test-user', 'A human creator asking about a first arcade idea')).statusCode).toBe(200);
    const humanSecond = await refine('g:test-user', 'A human creator asking about a second arcade idea');
    expect(humanSecond.statusCode).toBe(429);
    expect(humanSecond.json().error).toBe('daily refine quota exceeded');

    expect((await refine('bot:e2e', 'The deploy gate probing refine on the first deploy')).statusCode).toBe(200);
    expect((await refine('bot:e2e', 'The deploy gate probing refine on the second deploy')).statusCode).toBe(200);
    expect((await refine('bot:e2e', 'The deploy gate probing refine on the third deploy')).statusCode).toBe(200);

    // Higher, not unlimited.
    expect((await refine('bot:e2e', 'The deploy gate probing refine on the fourth deploy')).statusCode).toBe(429);

    await testApp.close();
    process.env.DAILY_REFINE_QUOTA = previous.human;
    process.env.DAILY_REFINE_QUOTA_BOT = previous.bot;
    if (previous.human === undefined) delete process.env.DAILY_REFINE_QUOTA;
    if (previous.bot === undefined) delete process.env.DAILY_REFINE_QUOTA_BOT;
  });

  it('never caches a totally empty answer, so one flaky call cannot pin an empty panel', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:test-user' });
    let call = 0;
    const flakyRefiner = {
      // First call comes back with nothing usable; the second succeeds.
      refine: async () => {
        call += 1;
        return call === 1
          ? { questions: [] }
          : { questions: [{ id: 'style', question: 'Which style?', options: [{ label: 'Pixel' }] }] };
      },
    };
    const testApp = await buildApp({
      store,
      sessionSecret,
      specRefiner: flakyRefiner,
      contentChecker: new PatternChecker(),
    });
    const token = mintSessionToken('g:test-user', sessionSecret);
    const payload = { title: 'Flaky Game', concept: 'A concept whose first refine attempt times out on us' };

    const first = await testApp.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      payload,
    });
    const second = await testApp.inject({
      method: 'POST',
      url: '/api/submissions/refine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      payload,
    });

    expect(first.json()).toEqual({ questions: [] });
    expect(second.json().questions).toHaveLength(1);

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

  // 'NONE' is what an absent (not failing) grounder replies with.
  const noGroundingClient = stubClient('NONE');
  function makeRefiner(options: ConstructorParameters<typeof VertexSpecRefiner>[0]) {
    return new VertexSpecRefiner({ groundingClient: noGroundingClient, ...options });
  }

  it('normalizes questions and caps them at four', async () => {
    let seen: GenerationRequest | undefined;
    const questions = Array.from({ length: 6 }, (_, i) => ({
      id: `q${i}`,
      question: `Question ${i}?`,
      options: [{ label: 'A', detail: 'first' }],
    }));
    const refiner = makeRefiner({
      client: stubClient(JSON.stringify({ questions }), (req) => (seen = req)),
    });

    const result = await refiner.refine({ title: 'Carrot Farm', concept: 'Grow carrots', locale: 'pl' });

    expect(result.questions).toHaveLength(4);
    expect(result.questions[0]).toEqual({
      id: 'q0',
      question: 'Question 0?',
      options: [{ label: 'A', detail: 'first' }],
      allowFreeText: true,
      // Opposite default to allowFreeText: a question is single-choice unless the
      // model explicitly says its options combine.
      multiple: false,
    });
    expect(seen?.temperature).toBe(0.2);
    expect(seen?.prompt[0]?.text).toContain('Carrot Farm');
    // Full language name, not a bare `pl` tag — models ignore the tag when the
    // concept itself is English.
    expect(seen?.prompt[0]?.text).toContain('Polish');
    expect(seen?.prompt[0]?.text).toContain('entirely in Polish');
  });

  it('asks for English by name when locale is missing or unknown', async () => {
    let seen: GenerationRequest | undefined;
    const refiner = makeRefiner({
      client: stubClient(JSON.stringify({ questions: [] }), (req) => (seen = req)),
    });

    await refiner.refine({ concept: 'A concept long enough to refine without a title yet' });

    expect(seen?.prompt[0]?.text).toContain('entirely in English');
  });

  it('fills defaults for partial question objects', async () => {
    const refiner = makeRefiner({
      client: stubClient('{"questions": [{"allowFreeText": false}]}'),
    });

    const result = await refiner.refine({ title: 'Game', concept: 'Concept' });

    expect(result.questions).toEqual([{ id: 'q_0', question: '', options: [], allowFreeText: false, multiple: false }]);
  });

  it('fails closed when the call outruns its abort budget', async () => {
    // The production failure mode this guards: the model answers, just not within
    // the budget, so the request aborts — and now that must surface as an error
    // rather than a silent "no questions".
    const refiner = makeRefiner({
      timeoutMs: 20,
      client: genaicode({
        name: 'hangs',
        generate: (request) =>
          new Promise((_resolve, reject) => {
            request.signal?.addEventListener('abort', () => reject(request.signal?.reason));
          }),
      }),
    });

    await expect(refiner.refine({ title: 'Game', concept: 'Concept' })).rejects.toThrow();
  });

  it('budgets far more time than the one-token moderation call', () => {
    // 5s was the old default and it aborted every real production attempt. Keeping
    // this floor explicit so the budget is not quietly tightened back to it.
    expect(DEFAULT_REFINE_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });

  it('fails closed on a malformed or non-conforming response', async () => {
    for (const body of ['not json at all', '', '{"questions": "nope"}']) {
      const refiner = makeRefiner({ client: stubClient(body) });
      await expect(refiner.refine({ title: 'Game', concept: 'Concept' })).rejects.toThrow();
    }
  });

  it('names the game, and asks for the name without being given one', async () => {
    // The concept arrives with no title now: the creator has not been asked for one,
    // which is exactly why the model is asked to propose it.
    let seen: GenerationRequest | undefined;
    const refiner = makeRefiner({
      client: stubClient(JSON.stringify({ suggestedTitle: 'TV Tycoon', questions: [] }), (req) => (seen = req)),
    });

    const result = await refiner.refine({ concept: 'Run a television studio and chase ratings' });

    expect(result.suggestedTitle).toBe('TV Tycoon');
    expect(seen?.prompt[0]?.text).toContain('suggestedTitle');
    // Nothing pretending to be a working title when there is none.
    expect(seen?.prompt[0]?.text).not.toContain('working title');
  });

  it('tidies a title the model wrapped in quotes or ended with a full stop', async () => {
    const refiner = makeRefiner({
      client: stubClient(JSON.stringify({ suggestedTitle: '  "TV Tycoon."  ', questions: [] })),
    });

    expect((await refiner.refine({ concept: 'Run a television studio' })).suggestedTitle).toBe('TV Tycoon');
  });

  it('offers no title rather than one the submission route would reject', async () => {
    // A suggestion the creator could not submit unedited is worse than none: they
    // would meet a validation error on a name they never wrote.
    for (const suggested of ['', 'ab', '   ']) {
      const refiner = makeRefiner({
        client: stubClient(JSON.stringify({ suggestedTitle: suggested, questions: [] })),
      });
      expect((await refiner.refine({ concept: 'Run a television studio' })).suggestedTitle).toBeUndefined();
    }

    const long = makeRefiner({
      client: stubClient(JSON.stringify({ suggestedTitle: 'A'.repeat(200), questions: [] })),
    });
    expect((await long.refine({ concept: 'Run a television studio' })).suggestedTitle).toHaveLength(80);
  });

  it('passes a working title through when the creator did supply one', async () => {
    let seen: GenerationRequest | undefined;
    const refiner = makeRefiner({
      client: stubClient(JSON.stringify({ questions: [] }), (req) => (seen = req)),
    });

    await refiner.refine({ title: 'Carrot Farm', concept: 'Grow carrots' });

    expect(seen?.prompt[0]?.text).toContain('Carrot Farm');
  });

  it('grounds the questions in what a named real game actually is', async () => {
    let seen: GenerationRequest | undefined;
    const refiner = new VertexSpecRefiner({
      client: stubClient(JSON.stringify({ questions: [] }), (req) => (seen = req)),
      groundingClient: stubClient('A fast-paced 3v3 top-down multiplayer shooter with short rounds.'),
    });

    await refiner.refine({ concept: 'A Brawl Stars clone with brawlers and gems' });

    expect(seen?.prompt[0]?.text).toContain('fast-paced 3v3 top-down multiplayer shooter');
  });

  it('does not pollute the prompt when grounding finds nothing (NONE)', async () => {
    let seen: GenerationRequest | undefined;
    const refiner = makeRefiner({
      client: stubClient(JSON.stringify({ questions: [] }), (req) => (seen = req)),
    });

    await refiner.refine({ concept: 'An original game about a lighthouse keeper and the tides' });

    expect(seen?.prompt[0]?.text).not.toContain('Real-world context');
  });

  it('fails open on grounding, still refining from the concept alone', async () => {
    let seen: GenerationRequest | undefined;
    const hangingGrounder = genaicode({
      name: 'hangs',
      generate: (request) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason));
        }),
    });
    const refiner = new VertexSpecRefiner({
      client: stubClient(JSON.stringify({ questions: [] }), (req) => (seen = req)),
      groundingClient: hangingGrounder,
      groundingTimeoutMs: 20,
    });

    const result = await refiner.refine({ concept: 'Run a television studio and chase ratings' });

    expect(result).toEqual({ questions: [] });
    expect(seen?.prompt[0]?.text).not.toContain('Real-world context');
  });
});
