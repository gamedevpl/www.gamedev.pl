import type { BuilderKind } from '@gamedevpl/contract';
import { describe, expect, it } from 'vitest';
import { mintCreatorAgentKey } from './agent-creator-key.js';
import { resolveCreatorAgentKeyForOpenRound, resolveCreatorAgentKeyForStart } from './agent-creator-key-resolve.js';
import { NO_OPEN_ROUND_REASON, PLATFORM_ROUND_REASON, SLUG_NOT_ON_ACCOUNT_REASON } from './agent-game-key.js';
import { InMemoryStore } from './store.js';

const secret = 'creator-resolve-test-secret';
const owner = 'g:owner';
const other = 'g:other';
const slug = 'sky-dodge';

async function seedSelfRound(
  store: InMemoryStore,
  issue: number,
  uid: string,
  gameSlug: string,
  builder: BuilderKind = 'self',
) {
  await store.createSubmission(issue, uid, 'Sky Dodge');
  await store.setSubmissionSlug(issue, gameSlug);
  await store.setRoundBuilder(issue, builder);
  await store.recordJobTransition(issue, {
    to: 'dispatched',
    at: new Date().toISOString(),
    by: 'system',
  });
}

describe('resolveCreatorAgentKeyForStart (BY-27a)', () => {
  it('binds to an open self round the creator owns', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 1, owner, slug);
    await store.ensureCreatorAgentKey(owner, new Date().toISOString());
    const key = mintCreatorAgentKey(secret, { creatorUid: owner, keyGeneration: 1 });

    const result = await resolveCreatorAgentKeyForStart(store, key, secret, slug);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.issueNumber).toBe(1);
    }
  });

  it('refuses an unowned slug without suggesting rotate', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 1, other, slug);
    await store.ensureCreatorAgentKey(owner, new Date().toISOString());
    const key = mintCreatorAgentKey(secret, { creatorUid: owner, keyGeneration: 1 });

    const result = await resolveCreatorAgentKeyForStart(store, key, secret, slug);
    expect(result).toEqual({ ok: false, reason: SLUG_NOT_ON_ACCOUNT_REASON });
    expect(result.ok === false && result.reason).not.toMatch(/rotated/i);
  });

  it('refuses a missing slug with the same account-slug reason', async () => {
    const store = new InMemoryStore();
    await store.ensureCreatorAgentKey(owner, new Date().toISOString());
    const key = mintCreatorAgentKey(secret, { creatorUid: owner, keyGeneration: 1 });

    const result = await resolveCreatorAgentKeyForStart(store, key, secret, 'does-not-exist');
    expect(result).toEqual({ ok: false, reason: SLUG_NOT_ON_ACCOUNT_REASON });
  });

  it('keeps no-open-round and platform-round distinct once ownership is confirmed', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(1, owner, 'Sky Dodge');
    await store.setSubmissionSlug(1, slug);
    await store.setSubmissionPublishedAt(1, '2026-07-01T00:00:00.000Z');
    await store.recordJobTransition(1, {
      to: 'published',
      at: '2026-07-01T00:00:00.000Z',
      by: 'operator',
      reason: 'published',
    });
    await store.ensureCreatorAgentKey(owner, new Date().toISOString());
    const key = mintCreatorAgentKey(secret, { creatorUid: owner, keyGeneration: 1 });

    const noRound = await resolveCreatorAgentKeyForStart(store, key, secret, slug);
    expect(noRound).toEqual({ ok: false, reason: NO_OPEN_ROUND_REASON });

    await store.createSubmission(2, owner, 'Sky Dodge');
    await store.setSubmissionSlug(2, slug);
    await store.setRoundBuilder(2, 'platform');
    await store.recordJobTransition(2, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });

    const platform = await resolveCreatorAgentKeyForStart(store, key, secret, slug);
    expect(platform).toEqual({ ok: false, reason: PLATFORM_ROUND_REASON });
  });
});

describe('resolveCreatorAgentKeyForOpenRound (BY-27b)', () => {
  it('refuses an unowned slug with the same account-slug reason as start', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 1, other, slug);
    await store.setSubmissionPublishedAt(1, '2026-07-01T00:00:00.000Z');
    await store.ensureCreatorAgentKey(owner, new Date().toISOString());
    const key = mintCreatorAgentKey(secret, { creatorUid: owner, keyGeneration: 1 });

    const forStart = await resolveCreatorAgentKeyForStart(store, key, secret, slug);
    const forOpen = await resolveCreatorAgentKeyForOpenRound(store, key, secret, slug);
    expect(forStart).toEqual({ ok: false, reason: SLUG_NOT_ON_ACCOUNT_REASON });
    expect(forOpen).toEqual({ ok: false, reason: SLUG_NOT_ON_ACCOUNT_REASON });
    expect(forOpen.ok === false && forOpen.reason).not.toMatch(/rotated/i);
  });

  it('refuses a missing slug without blaming the key', async () => {
    const store = new InMemoryStore();
    await store.ensureCreatorAgentKey(owner, new Date().toISOString());
    const key = mintCreatorAgentKey(secret, { creatorUid: owner, keyGeneration: 1 });

    const result = await resolveCreatorAgentKeyForOpenRound(store, key, secret, 'does-not-exist');
    expect(result).toEqual({ ok: false, reason: SLUG_NOT_ON_ACCOUNT_REASON });
  });
});
