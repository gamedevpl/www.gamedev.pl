import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fakeFirestore } from '../fake-firestore.js';
import type { OAuthDeviceAuthorization } from '../records/oauth-device.js';
import { FirestoreOAuthDeviceStore, InMemoryOAuthDeviceStore, type OAuthDeviceStore } from './oauth-device.js';

const now = 1_800_000_000_000;
function authorization(userCode = 'BCDF-GHJK', hash = 'private-hash'): OAuthDeviceAuthorization {
  return {
    userCode,
    deviceCodeHash: hash,
    clientId: 'gamedev-cli',
    scope: 'creator',
    deviceName: 'remote-box',
    expiresAtMs: now + 600_000,
    intervalSec: 5,
  };
}

function sharedFirestore() {
  const fake = fakeFirestore();
  const run = fake.db.runTransaction.bind(fake.db);
  let queue = Promise.resolve();
  // The fake lacks Firestore's transaction isolation; serialize these concurrency fixtures.
  fake.db.runTransaction = ((...args: Parameters<typeof run>) => {
    const result = queue.then(() => run(...args));
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }) as typeof fake.db.runTransaction;
  return fake;
}

for (const implementation of ['memory', 'firestore'] as const) {
  describe(`device authorization store: ${implementation}`, () => {
    function stores(): [OAuthDeviceStore, OAuthDeviceStore] {
      if (implementation === 'memory') {
        const store = new InMemoryOAuthDeviceStore();
        return [store, store];
      }
      const fake = sharedFirestore();
      return [new FirestoreOAuthDeviceStore(fake.db), new FirestoreOAuthDeviceStore(fake.db)];
    }

    it('persists the decision and polling cadence across store instances', async () => {
      const [first, second] = stores();
      await first.createOAuthDeviceAuthorization(authorization(), now, 64);
      expect(await second.getOAuthDeviceAuthorization('BCDF-GHJK', now)).toMatchObject({ deviceName: 'remote-box' });
      expect(await first.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now)).toEqual({
        ok: false,
        error: 'authorization_pending',
      });
      expect(await second.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now)).toEqual({
        ok: false,
        error: 'slow_down',
      });
      await second.decideOAuthDeviceAuthorization('BCDF-GHJK', { ownerUid: 'g:owner' }, now);
      expect(await first.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now + 10_000)).toMatchObject({
        ok: true,
        authorization: { ownerUid: 'g:owner' },
      });
      expect(await second.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now + 20_000)).toEqual({
        ok: false,
        error: 'invalid_grant',
      });
    });

    it('allows only one of two concurrent decisions and one of two concurrent claims', async () => {
      const [first, second] = stores();
      await first.createOAuthDeviceAuthorization(authorization(), now, 64);
      const decisions = await Promise.all([
        first.decideOAuthDeviceAuthorization('BCDF-GHJK', { ownerUid: 'g:first' }, now),
        second.decideOAuthDeviceAuthorization('BCDF-GHJK', { ownerUid: 'g:second' }, now),
      ]);
      expect(decisions.filter(Boolean)).toHaveLength(1);
      const claims = await Promise.all([
        first.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now),
        second.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now),
      ]);
      expect(claims.filter((claim) => claim.ok)).toHaveLength(1);
      expect(claims).toContainEqual({ ok: false, error: 'invalid_grant' });
    });

    it('enforces the pending-session cap during concurrent creation', async () => {
      const [first, second] = stores();
      const created = await Promise.all([
        first.createOAuthDeviceAuthorization(authorization(), now, 1),
        second.createOAuthDeviceAuthorization(authorization('LMNP-QRST', 'other-hash'), now, 1),
      ]);
      expect(created.sort()).toEqual(['created', 'full']);
    });

    it('does not overwrite live codes and reclaims expired capacity', async () => {
      const [store] = stores();
      await store.createOAuthDeviceAuthorization(authorization(), now, 1);
      expect(await store.createOAuthDeviceAuthorization(authorization('BCDF-GHJK', 'other-hash'), now, 1)).toBe(
        'collision',
      );
      expect(await store.getOAuthDeviceAuthorization('BCDF-GHJK', now + 600_000)).toBeNull();
      expect(await store.decideOAuthDeviceAuthorization('BCDF-GHJK', { ownerUid: 'g:owner' }, now + 600_000)).toBe(
        false,
      );
      expect(
        await store.createOAuthDeviceAuthorization(
          { ...authorization('BCDF-GHJK', 'replacement'), expiresAtMs: now + 1_200_000 },
          now + 600_000,
          1,
        ),
      ).toBe('created');
      expect(await store.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now + 600_000)).toEqual({
        ok: false,
        error: 'invalid_grant',
      });
    });

    it('reports expiry once and denies replay', async () => {
      const [store] = stores();
      await store.createOAuthDeviceAuthorization(authorization(), now, 64);
      expect(await store.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now + 600_000)).toEqual({
        ok: false,
        error: 'expired_token',
      });
      expect(await store.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now + 600_001)).toEqual({
        ok: false,
        error: 'invalid_grant',
      });
    });

    it('leaves a session untouched on a wrong client or unknown code', async () => {
      const [store] = stores();
      await store.createOAuthDeviceAuthorization(authorization(), now, 64);
      expect(await store.pollOAuthDeviceAuthorization('private-hash', 'other-client', now)).toEqual({
        ok: false,
        error: 'invalid_grant',
      });
      expect(await store.pollOAuthDeviceAuthorization('unknown', 'gamedev-cli', now)).toEqual({
        ok: false,
        error: 'invalid_grant',
      });
      expect(await store.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now)).toEqual({
        ok: false,
        error: 'authorization_pending',
      });
      expect(await store.getOAuthDeviceAuthorization('invalid/path', now)).toBeNull();
    });

    it('makes a denial final and erases approved sessions with the account', async () => {
      const [first, second] = stores();
      await first.createOAuthDeviceAuthorization(authorization(), now, 64);
      await second.decideOAuthDeviceAuthorization('BCDF-GHJK', { denied: true }, now);
      expect(await first.decideOAuthDeviceAuthorization('BCDF-GHJK', { ownerUid: 'g:owner' }, now)).toBe(false);
      expect(await first.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now)).toEqual({
        ok: false,
        error: 'access_denied',
      });
      await first.createOAuthDeviceAuthorization(authorization(), now, 64);
      await first.decideOAuthDeviceAuthorization('BCDF-GHJK', { ownerUid: 'g:owner', viaTokenId: 'pat-id' }, now);
      await second.eraseOAuthDeviceAuthorizations('g:owner');
      expect(await first.getOAuthDeviceAuthorization('BCDF-GHJK', now)).toBeNull();
      expect(await first.pollOAuthDeviceAuthorization('private-hash', 'gamedev-cli', now)).toEqual({
        ok: false,
        error: 'invalid_grant',
      });
    });
  });
}

it('writes timestamp TTL fields and provisions cleanup for both collections', async () => {
  const fake = fakeFirestore();
  const store = new FirestoreOAuthDeviceStore(fake.db);
  await store.createOAuthDeviceAuthorization(authorization(), now, 64);
  let expiring = 0;
  for (const [key, row] of fake.docs) {
    if (key.startsWith('oauthDeviceAuthorizations/') || key.startsWith('oauthDeviceCodes/')) {
      expiring++;
      expect(row.expiresAt).toEqual(new Date(now + 600_000));
    }
  }
  expect(expiring).toBe(2);
  const setup = readFileSync(new URL('../../../../../infra/setup-gcp.sh', import.meta.url), 'utf8');
  expect(setup).toContain('OAUTH_DEVICE_GROUPS="oauthDeviceAuthorizations oauthDeviceCodes"');
  expect(setup).toContain('for GROUP in $TELEMETRY_GROUPS $OAUTH_DEVICE_GROUPS; do');
});
