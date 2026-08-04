import { describe, expect, it } from 'vitest';
import { eraseAccount, OperatorAccountDeletionError } from './erase-account.js';
import { DELETED_ACCOUNT_UID, InMemoryStore } from './store.js';

describe('eraseAccount', () => {
  it('removes identity and credentials while retaining de-attributed published games', async () => {
    const store = new InMemoryStore();
    const uid = 'g:leaver';
    await store.upsertUser({ uid, email: 'leave@example.com', name: 'Leaver' });
    await store.claimHandle(uid, 'leaver', '2026-07-01T00:00:00.000Z');

    await store.createSubmission(1, uid, 'Published');
    await store.setSubmissionSlug(1, 'published-game');
    await store.setSubmissionPublishedAt(1, '2026-08-01T00:00:00.000Z');
    await store.createSubmission(2, uid, 'Draft');
    await store.setSubmissionSlug(2, 'draft-game');

    await store.createAccessToken({
      tokenId: 'token-1',
      uid,
      secretHash: 'hash',
      name: 'agent',
      createdAt: '2026-08-01T00:00:00.000Z',
      createdByUid: 'g:admin',
      expiresAt: '2027-08-01T00:00:00.000Z',
    });
    await store.ensureCreatorAgentKey(uid, '2026-08-01T00:00:00.000Z');
    await store.ensureGameAgentKey('published-game', uid, '2026-08-01T00:00:00.000Z');
    await store.createOAuthGrant({
      grantId: 'grant-1',
      clientId: 'client-1',
      ownerUid: uid,
      scope: 'mcp',
      createdAt: '2026-08-01T00:00:00.000Z',
      refreshFamilyId: 'family-1',
      currentRefreshTokenId: 'refresh-1',
      currentRefreshHash: 'hash',
      refreshExpiresAt: '2027-08-01T00:00:00.000Z',
    });
    await store.createOAuthAccessToken({
      tokenId: 'oauth-1',
      grantId: 'grant-1',
      ownerUid: uid,
      secretHash: 'hash',
      expiresAt: '2027-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    });

    const result = await eraseAccount({ store, uid, at: '2026-08-04T00:00:00.000Z' });

    expect(result.identity).toEqual({
      publishedSlugs: ['published-game'],
      unpublishedSlugs: ['draft-game'],
    });
    expect(await store.getUser(uid)).toBeNull();
    expect(await store.getUserByHandle('leaver')).toBeNull();
    expect(await store.getAccessToken('token-1')).toBeNull();
    expect(await store.getCreatorAgentKey(uid)).toBeNull();
    expect(await store.getGameAgentKey('published-game')).toBeNull();
    expect(await store.getOAuthAccessToken('oauth-1')).toBeNull();
    expect(await store.listOAuthGrantsByOwner(uid)).toEqual([]);

    expect(await store.getSubmission(1)).toMatchObject({
      ownerUid: DELETED_ACCOUNT_UID,
      slug: 'published-game',
      publishedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(await store.getSubmission(1)).not.toHaveProperty('abandonedAt');
    expect(await store.getSubmission(2)).toMatchObject({
      ownerUid: DELETED_ACCOUNT_UID,
      slug: 'draft-game',
      abandonedAt: '2026-08-04T00:00:00.000Z',
    });
  });

  it('previews without deleting anything', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:stay' });
    await store.createSubmission(1, 'g:stay', 'Published');
    await store.setSubmissionSlug(1, 'stays');
    await store.setSubmissionPublishedAt(1, '2026-08-01T00:00:00.000Z');

    const result = await eraseAccount({ store, uid: 'g:stay', dryRun: true });

    expect(result.identity.publishedSlugs).toEqual(['stays']);
    expect(await store.getUser('g:stay')).not.toBeNull();
    expect(await store.getSubmission(1)).toMatchObject({ ownerUid: 'g:stay' });
  });

  it('does not let the operator CLI erase a configured operator', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:operator' });

    await expect(eraseAccount({ store, uid: 'g:operator', adminUids: new Set(['g:operator']) })).rejects.toBeInstanceOf(
      OperatorAccountDeletionError,
    );
    expect(await store.getUser('g:operator')).not.toBeNull();
  });
});
