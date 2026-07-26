import { beforeEach, describe, expect, it } from 'vitest';
import { isAccessTokenExpired, parseAccessToken, verifyTokenSecret } from './access-token.js';
import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  MAX_TOKENS_PER_UID,
  MintAccessTokenError,
  mintAccessTokenFor,
  toPublicAccessToken,
} from './access-token-service.js';
import { InMemoryStore } from './store.js';

/**
 * The shared issuance rules. The HTTP route is covered end-to-end in
 * `access-token-routes.test.ts`; this file pins the contract itself, because the
 * `token:mint` CLI calls it directly and has no route tests behind it.
 */

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

describe('mintAccessTokenFor', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:human' });
  });

  it('stores only a hash that the issued token verifies against', async () => {
    const { token, record } = await mintAccessTokenFor(store, {
      uid: 'bot:e2e',
      name: 'cli',
      createdByUid: 'cli:owner',
      nowMs: NOW,
    });

    expect(verifyTokenSecret(parseAccessToken(token).secret, record.secretHash)).toBe(true);
    // Nothing anywhere in the stored record reproduces the credential.
    expect(JSON.stringify(record)).not.toContain(parseAccessToken(token).secret);
  });

  it('defaults expiry to 90 days and honours an explicit window', async () => {
    const fallback = await mintAccessTokenFor(store, {
      uid: 'bot:a',
      name: 'default',
      createdByUid: 'cli:owner',
      nowMs: NOW,
    });
    expect(Date.parse(fallback.record.expiresAt)).toBe(NOW + DEFAULT_EXPIRY_DAYS * 86_400_000);

    const explicit = await mintAccessTokenFor(store, {
      uid: 'bot:b',
      name: 'short',
      createdByUid: 'cli:owner',
      expiresInDays: 1,
      nowMs: NOW,
    });
    expect(Date.parse(explicit.record.expiresAt)).toBe(NOW + 86_400_000);
  });

  it('refuses expiry outside 1..MAX_EXPIRY_DAYS so the CLI cannot outrun the HTTP cap', async () => {
    await expect(
      mintAccessTokenFor(store, {
        uid: 'bot:e2e',
        name: 'x',
        createdByUid: 'cli:owner',
        expiresInDays: MAX_EXPIRY_DAYS + 1,
        nowMs: NOW,
      }),
    ).rejects.toMatchObject({ reason: 'invalid_expiry' });

    await expect(
      mintAccessTokenFor(store, {
        uid: 'bot:e2e',
        name: 'x',
        createdByUid: 'cli:owner',
        expiresInDays: 0,
        nowMs: NOW,
      }),
    ).rejects.toMatchObject({ reason: 'invalid_expiry' });

    await expect(
      mintAccessTokenFor(store, {
        uid: 'bot:e2e',
        name: 'x',
        createdByUid: 'cli:owner',
        expiresInDays: 1.5,
        nowMs: NOW,
      }),
    ).rejects.toMatchObject({ reason: 'invalid_expiry' });
  });

  it('creates a bot account but refuses to invent any other namespace', async () => {
    const created = await mintAccessTokenFor(store, {
      uid: 'bot:new',
      name: 'x',
      createdByUid: 'cli:owner',
      nowMs: NOW,
    });
    expect(created.accountCreated).toBe(true);
    expect(await store.getUser('bot:new')).not.toBeNull();

    await expect(
      mintAccessTokenFor(store, { uid: 'g:nonexistent', name: 'x', createdByUid: 'cli:owner', nowMs: NOW }),
    ).rejects.toMatchObject({ reason: 'unknown_uid' });
  });

  it('mints for an existing human account without recreating it', async () => {
    const result = await mintAccessTokenFor(store, {
      uid: 'g:human',
      name: 'laptop',
      createdByUid: 'cli:owner',
      nowMs: NOW,
    });

    expect(result.accountCreated).toBe(false);
    expect(result.record.uid).toBe('g:human');
  });

  it('refuses a blocked account', async () => {
    await store.upsertUser({ uid: 'g:banned', tier: 'blocked' });

    await expect(
      mintAccessTokenFor(store, { uid: 'g:banned', name: 'x', createdByUid: 'cli:owner', nowMs: NOW }),
    ).rejects.toBeInstanceOf(MintAccessTokenError);
  });

  it('enforces the per-account cap', async () => {
    for (let i = 0; i < MAX_TOKENS_PER_UID; i++) {
      await mintAccessTokenFor(store, { uid: 'bot:e2e', name: `t${i}`, createdByUid: 'cli:owner', nowMs: NOW });
    }

    await expect(
      mintAccessTokenFor(store, { uid: 'bot:e2e', name: 'extra', createdByUid: 'cli:owner', nowMs: NOW }),
    ).rejects.toMatchObject({ reason: 'too_many_tokens' });
  });

  it('records who issued it, so a mint is attributable afterwards', async () => {
    const { record } = await mintAccessTokenFor(store, {
      uid: 'bot:e2e',
      name: 'x',
      createdByUid: 'g:boss',
      nowMs: NOW,
    });

    expect(record.createdByUid).toBe('g:boss');
  });
});

describe('toPublicAccessToken', () => {
  it('drops the hash and reports expiry', async () => {
    const store = new InMemoryStore();
    const { record } = await mintAccessTokenFor(store, {
      uid: 'bot:e2e',
      name: 'x',
      createdByUid: 'cli:owner',
      expiresInDays: 1,
      nowMs: NOW,
    });

    const fresh = toPublicAccessToken(record, NOW);
    expect(fresh).not.toHaveProperty('secretHash');
    expect(fresh.expired).toBe(false);

    expect(toPublicAccessToken(record, NOW + 2 * 86_400_000).expired).toBe(true);
  });

  it('treats a malformed expiresAt as expired (fail closed)', () => {
    expect(isAccessTokenExpired('not-a-date', NOW)).toBe(true);
    expect(
      toPublicAccessToken(
        {
          tokenId: 'a'.repeat(16),
          uid: 'bot:e2e',
          secretHash: 'b'.repeat(64),
          name: 'x',
          createdAt: new Date(NOW).toISOString(),
          createdByUid: 'cli:owner',
          expiresAt: 'garbage',
        },
        NOW,
      ).expired,
    ).toBe(true);
  });
});
