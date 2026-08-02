import { describe, expect, it } from 'vitest';
import { NO_OPEN_ROUND_REASON, PLATFORM_ROUND_REASON, mintGameAgentKey } from './agent-game-key.js';
import { resolveGameAgentKeyForStart } from './agent-game-key-resolve.js';
import { InMemoryStore } from './store.js';

const secret = 'resolve-game-key-secret';
const slug = 'comet-courier';
const ownerUid = 'g:owner';
const now = Date.parse('2026-07-31T12:00:00.000Z');

async function seedActiveSelfRound(store: InMemoryStore, issueNumber: number, builder: 'self' | 'platform' = 'self') {
  await store.createSubmission(issueNumber, ownerUid, 'Comet Courier');
  await store.setSubmissionSlug(issueNumber, slug);
  await store.setRoundBuilder(issueNumber, builder);
  await store.recordJobTransition(issueNumber, {
    to: 'dispatched',
    at: new Date(now).toISOString(),
    by: 'system',
  });
  await store.ensureRoundGeneration(issueNumber);
}

function gameKey(generation = 1) {
  return mintGameAgentKey(secret, { slug, creatorUid: ownerUid, keyGeneration: generation, now });
}

describe('resolveGameAgentKeyForStart', () => {
  it('refuses when no open round exists', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await store.createSubmission(10, ownerUid, 'Comet Courier');
    await store.setSubmissionSlug(10, slug);
    await store.recordJobTransition(10, {
      to: 'ready_for_review',
      at: new Date(now).toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });

    const result = await resolveGameAgentKeyForStart(store, gameKey(), secret, now);
    expect(result).toEqual({ ok: false, reason: NO_OPEN_ROUND_REASON });
  });

  it('refuses when the open round is platform-built', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await seedActiveSelfRound(store, 11, 'platform');

    const result = await resolveGameAgentKeyForStart(store, gameKey(), secret, now);
    expect(result).toEqual({ ok: false, reason: PLATFORM_ROUND_REASON });
  });

  it('refuses when the key owner does not match the slug record', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await seedActiveSelfRound(store, 12, 'self');

    const strangerKey = mintGameAgentKey(secret, {
      slug,
      creatorUid: 'g:stranger',
      keyGeneration: 1,
      now,
    });
    const result = await resolveGameAgentKeyForStart(store, strangerKey, secret, now);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/rotated|invalid/i);
  });

  it('binds to the active self round on the happy path', async () => {
    const store = new InMemoryStore();
    const at = new Date(now).toISOString();
    await store.ensureGameAgentKey(slug, ownerUid, at);
    await seedActiveSelfRound(store, 13, 'self');

    const result = await resolveGameAgentKeyForStart(store, gameKey(), secret, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toMatchObject({ slug, creatorUid: ownerUid, keyGeneration: 1 });
      expect(result.record.issueNumber).toBe(13);
      expect(result.record.builder).toBe('self');
    }
  });
});
