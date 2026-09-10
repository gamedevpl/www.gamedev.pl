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

// Firestore projects fields; one left out of `select` reads absent.
describeStoreContract('delivery-scoped shot counts', (makeStore) => {
  const frame = { data: 'AAA=', mediaType: 'image/png' as const, label: 'AI concept' };
  const query = { label: 'AI concept', deliveryVersion: 'v2', roundGeneration: 3 };

  it('counts the agent frames one delivery of one round already holds', async () => {
    const store = makeStore();
    await store.appendBuildShot(9, { ...frame, deliveryVersion: 'v2', roundGeneration: 3 });

    expect(await store.countDeliveryShots(9, query)).toBe(1);
  });

  it('leaves out other deliveries, other rounds, other captions and our own frames', async () => {
    const store = makeStore();
    await store.appendBuildShot(9, { ...frame, deliveryVersion: 'v1', roundGeneration: 1 });
    await store.appendBuildShot(9, { ...frame, deliveryVersion: 'v2', roundGeneration: 2 });
    await store.appendBuildShot(9, { ...frame, label: 'Opening', deliveryVersion: 'v2', roundGeneration: 3 });
    await store.appendBuildShot(9, { ...frame, deliveryVersion: 'v2', roundGeneration: 3, platformDrawn: true });

    expect(await store.countDeliveryShots(9, query)).toBe(0);
  });
});

// The cap is the write itself, not a check before it.
describeStoreContract('delivery-scoped shot appends', (makeStore) => {
  const frame = { data: 'AAA=', mediaType: 'image/png' as const, label: 'AI concept' };
  const slot = { label: 'AI concept', deliveryVersion: 'v2', roundGeneration: 1, max: 2 };
  const shot = { ...frame, deliveryVersion: 'v2', roundGeneration: 1 };

  // The append also refuses a delivery the job moved past.
  async function delivering(store: Store): Promise<Store> {
    await store.createSubmission(9, 'g:owner', 'Parcel Run');
    await store.setSubmissionPreviewVersion(9, 'v2');
    return store;
  }

  it('stores up to the cap and refuses past it', async () => {
    const store = await delivering(makeStore());

    expect((await store.appendDeliveryShot(9, slot, shot)).ok).toBe(true);
    expect((await store.appendDeliveryShot(9, slot, shot)).ok).toBe(true);
    expect(await store.appendDeliveryShot(9, slot, shot)).toEqual({ ok: false, refused: 'too_many_shots' });
    expect(await store.countDeliveryShots(9, slot)).toBe(2);
  });

  it("counts only this delivery's own frames against the cap", async () => {
    const store = await delivering(makeStore());
    await store.appendBuildShot(9, { ...frame, deliveryVersion: 'v1', roundGeneration: 1 });
    await store.appendBuildShot(9, { ...frame, deliveryVersion: 'v2', roundGeneration: 2 });
    await store.appendBuildShot(9, { ...shot, platformDrawn: true });

    expect((await store.appendDeliveryShot(9, slot, shot)).ok).toBe(true);
    expect((await store.appendDeliveryShot(9, slot, shot)).ok).toBe(true);
    expect(await store.appendDeliveryShot(9, slot, shot)).toEqual({ ok: false, refused: 'too_many_shots' });
  });
});

// A retried PUT rewrites its own frame, not the other slot.
describeStoreContract('delivery-scoped shot idempotence', (makeStore) => {
  const slot = { label: 'AI concept', deliveryVersion: 'v2', roundGeneration: 1, max: 2 };
  const shot = { data: 'AAA=', label: 'AI concept', deliveryVersion: 'v2', roundGeneration: 1 };

  async function delivering(store: Store): Promise<Store> {
    await store.createSubmission(9, 'g:owner', 'Parcel Run');
    await store.setSubmissionPreviewVersion(9, 'v2');
    return store;
  }

  it('keeps one document per id, however often it is written', async () => {
    const store = await delivering(makeStore());

    const first = await store.appendDeliveryShot(9, { ...slot, id: 'concept-abc' }, shot);
    const retry = await store.appendDeliveryShot(9, { ...slot, id: 'concept-abc' }, shot);

    expect(retry.ok && first.ok && retry.shot.id === first.shot.id).toBe(true);
    expect(await store.countDeliveryShots(9, slot)).toBe(1);
  });

  it("keeps the first frame's bytes, so a posted card cannot be repainted", async () => {
    const store = await delivering(makeStore());
    await store.appendDeliveryShot(9, { ...slot, id: 'concept-abc' }, shot);

    const retry = await store.appendDeliveryShot(9, { ...slot, id: 'concept-abc' }, { ...shot, data: 'ZZZ=' });

    expect(retry.ok && retry.shot.data).toBe('AAA=');
    expect((await store.getBuildShot(9, 'concept-abc'))?.data).toBe('AAA=');
  });

  it('refuses a frame whose round was reopened under it', async () => {
    const store = await delivering(makeStore());
    await store.bumpRoundGeneration(9);

    // A reopen leaves the delivery pointers alone.
    expect(await store.appendDeliveryShot(9, { ...slot, id: 'concept-abc' }, shot)).toEqual({
      ok: false,
      refused: 'stale_delivery',
    });
  });

  it('refuses a frame whose delivery is no longer current', async () => {
    const store = await delivering(makeStore());
    await store.setSubmissionPreviewVersion(9, 'v3');

    expect(await store.appendDeliveryShot(9, { ...slot, id: 'concept-abc' }, shot)).toEqual({
      ok: false,
      refused: 'stale_delivery',
    });
    expect(await store.countDeliveryShots(9, slot)).toBe(0);
  });
});

// A claim belongs to the round it was taken in.
describeStoreContract('dream claim generations', (makeStore) => {
  async function delivering(store: Store): Promise<Store> {
    await store.createSubmission(11, 'g:owner', 'Parcel Run');
    await store.setSubmissionPreviewVersion(11, 'v1');
    return store;
  }

  it('refuses a second claim inside the same round', async () => {
    const store = await delivering(makeStore());

    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T12:00:00.000Z')).toBe(true);
    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T12:00:30.000Z')).toBe(false);
  });

  it('lets the reopened round claim the same delivery again', async () => {
    // A reopen leaves the version alone, so only the generation frees it.
    const store = await delivering(makeStore());
    await store.claimDreamRun(11, 'v1', '2026-09-07T12:00:00.000Z');
    await store.bumpRoundGeneration(11);

    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T12:00:30.000Z')).toBe(true);
  });

  it('frees a delivery whose finished claim belongs to the round before', async () => {
    // `endedAt` is final for its own round, not for the next one.
    const store = await delivering(makeStore());
    const claim = { version: 'v1', claimedAt: '2026-09-07T12:00:00.000Z' };
    await store.claimDreamRun(11, claim.version, claim.claimedAt);
    await store.finishDreamRun(11, claim, '2026-09-07T12:01:00.000Z');
    await store.bumpRoundGeneration(11);

    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T12:02:00.000Z')).toBe(true);
  });
});

// The claim is checked where the row is written.
describeStoreContract('proposal posting', (makeStore) => {
  const proposal = { sourceRef: 'shot-a', version: 'v1', options: [] };

  const claim = { version: 'v1', claimedAt: '2026-09-07T12:00:00.000Z' };

  async function claimed(store: Store): Promise<void> {
    await store.createSubmission(11, 'g:owner', 'Parcel Run');
    await store.setSubmissionPreviewVersion(11, 'v1');
    await store.claimDreamRun(11, claim.version, claim.claimedAt);
  }

  it('posts while the claim still names the version', async () => {
    const store = makeStore();
    await claimed(store);

    expect(
      await store.appendProposalMessage(11, claim, 'Two directions.', {
        proposal,
        ownerUid: 'g:owner',
        roundGeneration: 1,
      }),
    ).not.toBeNull();
    expect(await store.listCreatorMessages(11)).toHaveLength(1);
  });

  it('refuses a muted owner inside the posting transaction', async () => {
    // The mute can land while the shots are written.
    const store = makeStore();
    await claimed(store);
    await store.upsertUser({ uid: 'g:owner' });
    await store.setProposalsMuted('g:owner', '2026-09-07T12:30:00.000Z');

    expect(
      await store.appendProposalMessage(11, claim, 'Two directions.', {
        proposal,
        ownerUid: 'g:owner',
        roundGeneration: 1,
      }),
    ).toBeNull();
    expect(await store.listCreatorMessages(11)).toEqual([]);
  });

  it('refuses a card whose round was reopened under it', async () => {
    // A reopen bumps the generation and leaves the delivery version alone.
    const store = makeStore();
    await claimed(store);
    await store.bumpRoundGeneration(11);

    expect(
      await store.appendProposalMessage(11, claim, 'Two directions.', {
        proposal,
        ownerUid: 'g:owner',
        roundGeneration: 1,
      }),
    ).toBeNull();
    expect(await store.listCreatorMessages(11)).toEqual([]);
  });

  it('marks the claim posted, so it can never be retaken', async () => {
    const store = makeStore();
    await claimed(store);
    await store.appendProposalMessage(11, claim, 'Two directions.', {
      proposal,
      ownerUid: 'g:owner',
      roundGeneration: 1,
    });

    // A card is on the thread, so the delivery is finished.
    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T13:00:00.000Z')).toBe(false);
    expect(
      await store.appendProposalMessage(11, claim, 'Again.', { proposal, ownerUid: 'g:owner', roundGeneration: 1 }),
    ).toBeNull();
  });

  it('leaves a finished run finished, however it ended', async () => {
    const store = makeStore();
    await claimed(store);
    await store.finishDreamRun(11, claim, '2026-09-07T12:00:10.000Z');

    // A run that answered `no_frames` must not be paid twice.
    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T13:00:00.000Z')).toBe(false);
  });

  it("starts a new version from a clean claim, not the last one's leftovers", async () => {
    const store = makeStore();
    await claimed(store);
    await store.appendProposalMessage(11, claim, 'Two directions.', {
      proposal,
      ownerUid: 'g:owner',
      roundGeneration: 1,
    });
    await store.setSubmissionPreviewVersion(11, 'v2');

    expect(await store.claimDreamRun(11, 'v2', '2026-09-07T13:00:00.000Z')).toBe(true);
    // A kept `postedAt` from v1 would refuse v2's own card.
    const v2 = { version: 'v2', claimedAt: '2026-09-07T13:00:00.000Z' };
    expect(
      await store.appendProposalMessage(11, v2, 'Two more.', { proposal, ownerUid: 'g:owner', roundGeneration: 1 }),
    ).not.toBeNull();
    expect((await store.getSubmission(11))?.dreamRun?.endedAt).toBeUndefined();
  });

  it('ignores a worker whose lease already expired', async () => {
    const store = makeStore();
    await claimed(store);
    // The replacement takes the version an hour later.
    await store.claimDreamRun(11, 'v1', '2026-09-07T13:00:00.000Z');

    await store.finishDreamRun(11, claim, '2026-09-07T13:00:05.000Z');
    expect(
      await store.appendProposalMessage(11, claim, 'Late.', { proposal, ownerUid: 'g:owner', roundGeneration: 1 }),
    ).toBeNull();

    // The replacement is still recoverable, and still the one that may post.
    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T14:00:00.000Z')).toBe(true);
  });

  it('lets a claim that never posted be retaken once its worker is gone', async () => {
    const store = makeStore();
    await claimed(store);

    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T12:00:30.000Z')).toBe(false);
    expect(await store.claimDreamRun(11, 'v1', '2026-09-07T13:00:00.000Z')).toBe(true);
  });

  it('refuses once a newer delivery took the claim', async () => {
    const store = makeStore();
    await claimed(store);
    await store.setSubmissionPreviewVersion(11, 'v2');
    await store.claimDreamRun(11, 'v2', '2026-09-07T12:01:00.000Z');

    expect(
      await store.appendProposalMessage(11, claim, 'Two directions.', {
        proposal,
        ownerUid: 'g:owner',
        roundGeneration: 1,
      }),
    ).toBeNull();
    expect(await store.listCreatorMessages(11)).toEqual([]);
  });
});

// The strip filters after the read; a crowd must not empty it.
describeStoreContract('media strip paging', (makeStore) => {
  // Explicit timestamps; same-millisecond appends would not order.
  const shot = (label: string, minute: number) => ({
    data: 'AAA=',
    mediaType: 'image/png' as const,
    label,
    createdAt: new Date(Date.UTC(2026, 8, 7, 12, minute)).toISOString(),
  });

  it('reaches past two deliveries of proposal shots to the real one', async () => {
    const store = makeStore();
    await store.appendBuildShot(12, shot('Opening', 0));
    // Two deliveries of proposal shots, all newer than the real one.
    for (let index = 0; index < 6; index += 1) await store.appendBuildShot(12, shot('AI concept', index + 1));

    const strip = await store.listBuildShots(12, { limit: 1, excludeLabels: ['AI concept'] });

    expect(strip.map((item) => item.label)).toEqual(['Opening']);
  });
});
