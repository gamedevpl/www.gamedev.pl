import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { PatternChecker } from '../platform/moderation.js';
import { InMemoryStore } from '../platform/store.js';
import type { OptionImage, OptionImageGenerator, OptionImageParams } from './option-images.js';
import { DEFAULT_DAILY_OPTION_IMAGE_QUOTA } from './option-image-routes.js';

const sessionSecret = 'dev-session-secret-change-me';
const CONCEPT = 'Dodge the falling rocks and survive as long as possible in a 2D canvas arena';

const PAYLOAD = {
  concept: CONCEPT,
  question: 'Jaki styl graficzny ma mieć gra?',
  options: [{ label: 'Pixel Art', detail: 'Retro' }, { label: 'Minimalistyczny 2D' }],
};

let open: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(open.map((app) => app.close()));
  open = [];
});

async function createApp(generator?: OptionImageGenerator) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:test-user' });
  const app = await buildApp({
    store,
    sessionSecret,
    contentChecker: new PatternChecker(),
    ...(generator ? { optionImageGenerator: generator } : {}),
  });
  open.push(app);
  const token = mintSessionToken('g:test-user', sessionSecret);
  return { app, store, authHeaders: { cookie: `${SESSION_COOKIE_NAME}=${token}` } };
}

function stubGenerator(generate: (params: OptionImageParams) => Promise<OptionImage[]>): OptionImageGenerator {
  return { generate };
}

describe('POST /api/submissions/option-images', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { app } = await createApp(stubGenerator(async () => []));

    const res = await app.inject({ method: 'POST', url: '/api/submissions/option-images', payload: PAYLOAD });

    expect(res.statusCode).toBe(401);
  });

  it('returns the tiles the generator produced', async () => {
    const { app, authHeaders } = await createApp(
      stubGenerator(async (params) => params.options.map((o) => ({ label: o.label, image: `data:${o.label}` }))),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: PAYLOAD,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().images).toEqual([
      { label: 'Pixel Art', image: 'data:Pixel Art' },
      { label: 'Minimalistyczny 2D', image: 'data:Minimalistyczny 2D' },
    ]);
  });

  it('serves no tiles rather than an error when the feature is unconfigured', async () => {
    const { app, authHeaders } = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: PAYLOAD,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().images).toEqual([]);
  });

  it('fails open when the generator throws', async () => {
    const { app, authHeaders } = await createApp(
      stubGenerator(async () => {
        throw new Error('vendor down');
      }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: PAYLOAD,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().images).toEqual([]);
  });

  it('serves no tiles, rather than a 400, for a question with more options than it illustrates', async () => {
    // Refine bounds questions at four, never options, so five is legitimate.
    let called = false;
    const { app, authHeaders } = await createApp(
      stubGenerator(async () => {
        called = true;
        return [];
      }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: {
        ...PAYLOAD,
        options: Array.from({ length: 5 }, (_, i) => ({ label: `Option ${i}` })),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().images).toEqual([]);
    // Nothing generated: tiles need every option covered.
    expect(called).toBe(false);
  });

  it('still refuses an option list far past anything a refiner would produce', async () => {
    const { app, authHeaders } = await createApp(stubGenerator(async () => []));

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: {
        ...PAYLOAD,
        options: Array.from({ length: 40 }, (_, i) => ({ label: `Option ${i}` })),
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('moderates the text it was handed, which no refine vouched for', async () => {
    let called = false;
    const { app, authHeaders } = await createApp(
      stubGenerator(async () => {
        called = true;
        return [];
      }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: { ...PAYLOAD, concept: 'this game is fucking stupid and terrible dodge falling rocks' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('content_rejected');
    expect(called).toBe(false);
  });

  it('stops generating once the global daily cap is spent, and degrades to plain text', async () => {
    let calls = 0;
    const { app, store, authHeaders } = await createApp(
      stubGenerator(async (params) => {
        calls++;
        return params.options.map((o) => ({ label: o.label, image: `data:${o.label}` }));
      }),
    );
    await store.setCreationLimits({ globalDailyOptionImageCap: 1 }, 'test');

    const first = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: PAYLOAD,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: PAYLOAD,
    });

    expect(first.json().images).toHaveLength(2);
    // Not an error: the same plain text a vendor outage produces.
    expect(second.statusCode).toBe(200);
    expect(second.json().images).toEqual([]);
    expect(calls).toBe(1);
  });

  it('stops generating once the caller has spent their own daily quota', async () => {
    let calls = 0;
    const { app, store, authHeaders } = await createApp(
      stubGenerator(async (params) => {
        calls++;
        return params.options.map((o) => ({ label: o.label, image: `data:${o.label}` }));
      }),
    );
    // Spend the whole allowance, so the next request is refused.
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < DEFAULT_DAILY_OPTION_IMAGE_QUOTA; i++) {
      await store.checkAndIncrementQuota('g:test-user', today, Number.MAX_SAFE_INTEGER, 'optionImages');
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: PAYLOAD,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().images).toEqual([]);
    expect(calls).toBe(0);
  });

  it('spends no global slot when the cap refuses, so a closed day cannot drain the counter', async () => {
    const { app, store, authHeaders } = await createApp(stubGenerator(async () => []));
    await store.setCreationLimits({ globalDailyOptionImageCap: 0 }, 'test');

    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions/option-images',
      headers: authHeaders,
      payload: PAYLOAD,
    });

    expect(res.json().images).toEqual([]);
    expect(await store.getGlobalOptionImageCount(new Date().toISOString().slice(0, 10))).toBe(0);
  });

  it('reads a blank quota variable as not configured, not as a closed route', async () => {
    const previous = process.env.DAILY_OPTION_IMAGE_QUOTA;
    process.env.DAILY_OPTION_IMAGE_QUOTA = '   ';
    try {
      const { app, authHeaders } = await createApp(
        stubGenerator(async (params) => params.options.map((o) => ({ label: o.label, image: `data:${o.label}` }))),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/submissions/option-images',
        headers: authHeaders,
        payload: PAYLOAD,
      });

      expect(res.json().images).toHaveLength(2);
    } finally {
      if (previous === undefined) delete process.env.DAILY_OPTION_IMAGE_QUOTA;
      else process.env.DAILY_OPTION_IMAGE_QUOTA = previous;
    }
  });
});
