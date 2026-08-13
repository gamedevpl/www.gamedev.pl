import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { APIRequestContext } from 'playwright-core';
import { signedInApiContext } from './browser.js';

// Real POST to /refine — no other e2e suite exercised this path.
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
    // base36 — a decimal timestamp trips the L1 PII phone-number regex.
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
