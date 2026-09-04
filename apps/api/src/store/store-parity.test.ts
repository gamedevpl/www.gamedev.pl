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
      scope: 'creator',
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
    const second = await store.issueOAuthTokensFromGrant({
      grantId: 'grant-issue',
      refreshTokenId: 'refresh-b',
      refreshHash: 'hash-b',
      refreshExpiresAt: '2026-09-22T00:00:00Z',
      nowMs,
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
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-a')).toBeNull();
    expect(await store.getOAuthGrantByRefreshTokenId('refresh-b')).toMatchObject({ grantId: 'grant-issue' });
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
