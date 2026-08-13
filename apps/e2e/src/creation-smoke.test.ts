import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext } from 'playwright-core';
import { signedInApiContext } from './browser.js';

/**
 * The creation flow's happy path, hit for real on every deploy.
 *
 * `POST /api/submissions/refine` is the first real Vertex call a creator's prompt goes
 * through — content moderation, then the refine model. Every other e2e suite either
 * plays existing games or stubs the network on purpose to stay read-only against
 * production; nothing exercised this path, which is exactly why an incident where
 * gemini-3.7-flash started 400ing on every moderation call (a bad `thinkingConfig`, not
 * a policy change) shipped undetected — CI, unit tests, and the browser gate all stayed
 * green, and the deploy that broke it still promoted. A benign prompt getting rejected
 * is indistinguishable, from the API's perspective, between "the model call crashed and
 * moderation failed closed" and "moderation genuinely doesn't like this text" — this
 * test does not care which; either way a creator hit a wall that should not be there.
 *
 * Cheap and self-contained on purpose: `/refine` only runs moderation + one refine call,
 * no game generation and no agent dispatch (apps/api/src/refine.ts), so this costs a
 * couple of Gemini calls per deploy, not a build. The concept text is nonce'd per run —
 * refine caches by exact (title, concept, locale) and skips moderation entirely on a
 * cache hit (refine.ts's own comment: "no moderation call, no quota, no Vertex"), so a
 * fixed prompt would only ever really test the first run in the cache's lifetime.
 */
const hasToken = Boolean(process.env.GAMEDEV_ACCESS_TOKEN);
if (!hasToken) {
  console.warn('[e2e] SKIPPED creation smoke: GAMEDEV_ACCESS_TOKEN not set (see docs/agent-access-tokens.md)');
}

describe.skipIf(!hasToken)('creation happy path', () => {
  let api: APIRequestContext;

  beforeAll(async () => {
    api = await signedInApiContext();
  });

  afterAll(async () => {
    await api?.dispose();
  });

  it('refines an ordinary game idea instead of rejecting it', async () => {
    // The nonce forces a fresh cache key (and therefore a real moderation + refine
    // call) on every run; the concept text itself is deliberately unremarkable.
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await api.post('/api/submissions/refine', {
      data: {
        concept: `A short arcade game where you dodge falling rocks and survive as long as possible. E2E smoke ${nonce}.`,
        locale: 'en',
      },
    });

    const body = await res.json().catch(() => undefined);
    expect(res.status(), `expected 200, got ${res.status()}: ${JSON.stringify(body)}`).toBe(200);
    expect(body?.error, `refine rejected a benign prompt: ${JSON.stringify(body)}`).toBeUndefined();
    expect(Array.isArray(body?.questions)).toBe(true);
  });
});
