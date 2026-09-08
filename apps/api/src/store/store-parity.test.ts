import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

// Runs the same assertions against InMemoryStore and FirestoreStore(fake).
const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

function describeStoreContract(sliceName: string, spec: (makeStore: () => Store) => void): void {
  describe(`store contract: ${sliceName}`, () => {
    for (const [implName, makeStore] of IMPLEMENTATIONS) {
      describe(implName, () => spec(makeStore));
    }
  });
}

// Both stores hand-list these fields, so one side drops them easily.
describeStoreContract('creation limits', (makeStore) => {
  it('round-trips the load-shedding rungs, one field at a time', async () => {
    const store = makeStore();
    expect(await store.getCreationLimits()).toBeNull();

    await store.setCreationLimits({ partyPaused: true }, 'operator');
    expect(await store.getCreationLimits()).toMatchObject({ partyPaused: true });

    await store.setCreationLimits({ telemetrySampleRate: 0.25 }, 'operator');
    const both = await store.getCreationLimits();
    expect(both).toMatchObject({ partyPaused: true, telemetrySampleRate: 0.25 });
  });

  it('reads back every field a patch can set', async () => {
    const store = makeStore();
    const patch = {
      paused: true,
      globalDailySubmissionCap: 7,
      editingPaused: true,
      chatPaused: true,
      searchPaused: true,
      gatePaused: true,
      tabCompletePaused: true,
      partyPaused: true,
      telemetrySampleRate: 0.5,
      seedingMode: 'off' as const,
    };
    await store.setCreationLimits(patch, 'operator');
    expect(await store.getCreationLimits()).toMatchObject(patch);
  });
});

describeStoreContract('oauth', (makeStore) => {
  it('round-trips a client through create/get, and returns null for a missing one', async () => {
    const store = makeStore();
    await store.createOAuthClient({
      clientId: 'client-1',
      registrationType: 'dcr',
      redirectUris: ['https://example.test/cb'],
      tokenEndpointAuthMethod: 'none',
      createdAt: '2026-08-22T00:00:00Z',
    });
    expect(await store.getOAuthClient('client-1')).toMatchObject({ clientId: 'client-1' });
    expect(await store.getOAuthClient('missing')).toBeNull();
  });

  it('lists grants by owner and resolves one by its refresh token id', async () => {
    const store = makeStore();
    await store.createOAuthGrant({
      grantId: 'grant-1',
      clientId: 'client-1',
      ownerUid: 'g:user-1',
      scope: 'mcp',
      createdAt: '2026-08-22T00:00:00Z',
      refreshFamilyId: 'family-1',
      currentRefreshTokenId: 'refresh-1',
      currentRefreshHash: 'hash-1',
      refreshExpiresAt: '2026-09-22T00:00:00Z',
    });
    expect(await store.listOAuthGrantsByOwner('g:user-1')).toHaveLength(1);
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-1')).toMatchObject({ grantId: 'grant-1' });
    expect(await store.getOAuthGrantByRefreshTokenId('no-such-token')).toBeNull();
  });

  it('revokes a grant only for its actual owner, and drops it from the owner listing', async () => {
    const store = makeStore();
    await store.createOAuthGrant({
      grantId: 'grant-2',
      clientId: 'client-1',
      ownerUid: 'g:user-1',
      scope: 'mcp',
      createdAt: '2026-08-22T00:00:00Z',
      refreshFamilyId: 'family-2',
      currentRefreshTokenId: 'refresh-2',
      currentRefreshHash: 'hash-2',
      refreshExpiresAt: '2026-09-22T00:00:00Z',
    });
    expect(await store.revokeOAuthGrant('grant-2', 'g:someone-else')).toBe(false);
    expect(await store.revokeOAuthGrant('grant-2', 'g:user-1')).toBe(true);
    expect(await store.listOAuthGrantsByOwner('g:user-1')).toHaveLength(0);
  });

  it('replaces the refresh family when the same grant is issued again', async () => {
    const store = makeStore();
    await store.createOAuthGrant({
      grantId: 'grant-issue',
      clientId: 'client-1',
      ownerUid: 'g:user-1',
      scope: 'mcp creator',
      createdAt: '2026-08-22T00:00:00Z',
      refreshFamilyId: 'grant-issue',
      currentRefreshTokenId: '',
      currentRefreshHash: '',
      refreshExpiresAt: '2026-09-22T00:00:00Z',
    });
    const nowMs = Date.parse('2026-08-22T00:10:00Z');
    const first = await store.issueOAuthTokensFromGrant({
      grantId: 'grant-issue',
      refreshTokenId: 'refresh-a',
      refreshHash: 'hash-a',
      refreshExpiresAt: '2026-09-22T00:00:00Z',
      nowMs,
      accessToken: {
        tokenId: 'access-a',
        grantId: 'grant-issue',
        ownerUid: 'g:user-1',
        secretHash: 'secret-a',
        expiresAt: '2026-08-22T01:00:00Z',
        createdAt: '2026-08-22T00:10:00Z',
      },
    });
    expect(first?.currentRefreshTokenId).toBe('refresh-a');
    const rotated = await store.rotateOAuthRefreshToken({
      refreshTokenId: 'refresh-a',
      refreshSecretHash: 'hash-a',
      newRefreshTokenId: 'refresh-rot',
      newRefreshHash: 'hash-rot',
      newRefreshExpiresAt: '2026-09-22T00:00:00Z',
      nowMs,
      newAccessToken: {
        tokenId: 'access-rot',
        grantId: 'grant-issue',
        ownerUid: 'g:user-1',
        secretHash: 'secret-rot',
        expiresAt: '2026-08-22T01:00:00Z',
        createdAt: '2026-08-22T00:10:00Z',
      },
    });
    expect(rotated.ok).toBe(true);
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-a')).toMatchObject({ grantId: 'grant-issue' });

    const second = await store.issueOAuthTokensFromGrant({
      grantId: 'grant-issue',
      refreshTokenId: 'refresh-b',
      refreshHash: 'hash-b',
      refreshExpiresAt: '2026-09-22T00:00:00Z',
      nowMs,
      scope: 'creator',
      accessToken: {
        tokenId: 'access-b',
        grantId: 'grant-issue',
        ownerUid: 'g:user-1',
        secretHash: 'secret-b',
        expiresAt: '2026-08-22T01:00:00Z',
        createdAt: '2026-08-22T00:10:00Z',
      },
    });
    expect(second?.currentRefreshTokenId).toBe('refresh-b');
    expect(second?.scope).toBe('creator');
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-a')).toBeNull();
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-rot')).toBeNull();
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-b')).toMatchObject({ grantId: 'grant-issue' });

    const stale = await store.rotateOAuthRefreshToken({
      refreshTokenId: 'refresh-a',
      refreshSecretHash: 'hash-a',
      newRefreshTokenId: 'refresh-stale',
      newRefreshHash: 'hash-stale',
      newRefreshExpiresAt: '2026-09-22T00:00:00Z',
      nowMs,
      newAccessToken: {
        tokenId: 'access-stale',
        grantId: 'grant-issue',
        ownerUid: 'g:user-1',
        secretHash: 'secret-stale',
        expiresAt: '2026-08-22T01:00:00Z',
        createdAt: '2026-08-22T00:10:00Z',
      },
    });
    expect(stale).toEqual({ ok: false, reason: 'invalid' });
    expect((await store.getOAuthGrant('grant-issue'))?.revokedAt).toBeUndefined();
    expect((await store.getOAuthGrant('grant-issue'))?.currentRefreshTokenId).toBe('refresh-b');
  });

  it('deletes an access token once, then reports nothing left to delete', async () => {
    const store = makeStore();
    await store.createOAuthAccessToken({
      tokenId: 'token-1',
      grantId: 'grant-1',
      ownerUid: 'g:user-1',
      secretHash: 'hash',
      expiresAt: '2026-09-22T00:00:00Z',
      createdAt: '2026-08-22T00:00:00Z',
    });
    expect(await store.deleteOAuthAccessToken('token-1')).toBe(true);
    expect(await store.deleteOAuthAccessToken('token-1')).toBe(false);
    expect(await store.getOAuthAccessToken('token-1')).toBeNull();
  });
});

describeStoreContract('telemetry', (makeStore) => {
  it("appends and lists a day's events, filtered by slug", async () => {
    const store = makeStore();
    await store.appendTelemetryEvents('2026-08-22', [
      { slug: 'game-a', sessionId: 's1', type: 'game_opened', at: '2026-08-22T10:00:00Z' },
      { slug: 'game-b', sessionId: 's2', type: 'game_opened', at: '2026-08-22T10:01:00Z' },
    ]);
    expect(await store.listTelemetryEvents('2026-08-22')).toHaveLength(2);
    const forA = await store.listTelemetryEvents('2026-08-22', { slug: 'game-a' });
    expect(forA).toHaveLength(1);
    expect(forA[0]?.slug).toBe('game-a');
  });

  it('keeps days independent', async () => {
    const store = makeStore();
    await store.appendTelemetryEvents('2026-08-22', [
      { slug: 'game-a', sessionId: 's1', type: 'game_opened', at: '2026-08-22T10:00:00Z' },
    ]);
    await store.appendTelemetryEvents('2026-08-23', [
      { slug: 'game-a', sessionId: 's2', type: 'game_opened', at: '2026-08-23T10:00:00Z' },
    ]);
    expect(await store.listTelemetryEvents('2026-08-22')).toHaveLength(1);
    expect(await store.listTelemetryEvents('2026-08-23')).toHaveLength(1);
    expect(await store.listTelemetryEvents('2026-08-24')).toHaveLength(0);
  });

  it('filters visit events by type and excludeType', async () => {
    const store = makeStore();
    await store.appendVisitEvents('2026-08-22', [
      { visitId: 'v1', type: 'visit_started', at: '2026-08-22T10:00:00Z', msSinceStart: 0 },
      { visitId: 'v1', type: 'route_viewed', at: '2026-08-22T10:00:01Z', msSinceStart: 100 },
    ]);
    const started = await store.listVisitEvents('2026-08-22', { type: 'visit_started' });
    expect(started).toHaveLength(1);
    const withoutStarted = await store.listVisitEvents('2026-08-22', { excludeType: 'visit_started' });
    expect(withoutStarted).toHaveLength(1);
    expect(withoutStarted[0]?.type).toBe('route_viewed');
  });
});

describeStoreContract('creation limits', (makeStore) => {
  // The Firestore read once dropped fields the write had persisted.
  it('reads back every field a patch persisted', async () => {
    const store = makeStore();
    await store.setCreationLimits({ partyPaused: true, telemetrySampleRate: 0.1 }, 'g:boss');

    const limits = await store.getCreationLimits();
    expect(limits?.partyPaused).toBe(true);
    expect(limits?.telemetrySampleRate).toBe(0.1);
  });

  it('reads a lane back off again', async () => {
    const store = makeStore();
    await store.setCreationLimits({ partyPaused: true }, 'g:boss');
    await store.setCreationLimits({ partyPaused: false }, 'g:boss');

    expect((await store.getCreationLimits())?.partyPaused).toBe(false);
  });

  it('leaves the other lane alone on a partial patch', async () => {
    const store = makeStore();
    await store.setCreationLimits({ partyPaused: true, telemetrySampleRate: 0.25 }, 'g:boss');
    await store.setCreationLimits({ telemetrySampleRate: null }, 'g:boss');

    const limits = await store.getCreationLimits();
    expect(limits?.partyPaused).toBe(true);
    expect(limits?.telemetrySampleRate).toBeNull();
  });
});
