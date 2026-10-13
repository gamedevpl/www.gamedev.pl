import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../store/fake-firestore.js';
import { FirestoreStore, InMemoryStore } from './store.js';
import type { DeviceTokenIssuanceInput } from '../store/records/oauth-device.js';
import { buildOAuthApp, enableCliSurface, sessionCookie, SESSION_SECRET } from './oauth-cli-test-app.js';
import { consentToken } from './oauth-consent.js';
import { DEVICE_GRANT_TYPE } from './oauth-device.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';

function atomicFirestore() {
  const fake = fakeFirestore();
  const run = fake.db.runTransaction.bind(fake.db);
  let queue = Promise.resolve();
  let failure: string | undefined;
  // Emulate rollback and isolation absent from the shared fake.
  fake.db.runTransaction = ((fn) => {
    const result = queue.then(async () => {
      const before = structuredClone([...fake.docs]);
      try {
        return await run(async (tx) => {
          const result = await fn(tx);
          if (
            failure &&
            [...fake.docs.keys()].some((key) => key.startsWith(`${failure}/`) && !before.some(([old]) => old === key))
          ) {
            failure = undefined;
            throw new Error('Injected Firestore commit failure');
          }
          return result;
        });
      } catch (error) {
        fake.docs.clear();
        for (const [key, row] of before) fake.docs.set(key, row);
        throw error;
      }
    });
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }) as typeof fake.db.runTransaction;
  return {
    ...fake,
    failNextCommitCreating: (collection: string) => {
      failure = collection;
    },
  };
}

describe('atomic device token issuance', () => {
  const apps: FastifyInstance[] = [];
  let restore: () => void;
  let clock: number;
  beforeEach(() => {
    restore = enableCliSurface();
    clock = Date.now();
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    restore();
  });

  async function backend(fake: ReturnType<typeof atomicFirestore>) {
    const store = new FirestoreStore(fake.db);
    const app = await buildOAuthApp(store, { now: () => clock });
    apps.push(app);
    return { app, store };
  }

  async function approve(app: FastifyInstance, scope = 'creator') {
    const created = await app.inject({
      method: 'POST',
      url: '/oauth/device',
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID, scope },
    });
    expect(created.statusCode).toBe(200);
    const { user_code: userCode, device_code: deviceCode } = created.json();
    const approved = await app.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss') },
      payload: {
        user_code: userCode,
        action: 'approve',
        disclosed_scope: scope,
        consent_token: consentToken({
          uid: 'g:boss',
          clientId: GAMEDEV_CLI_CLIENT_ID,
          codeChallenge: 'device',
          secret: SESSION_SECRET,
        }),
      },
    });
    expect(approved.body).toContain('Approved. Return to your terminal.');
    return { userCode: userCode as string, deviceCode: deviceCode as string };
  }

  const tokenRequest = (app: FastifyInstance, fields: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ client_id: GAMEDEV_CLI_CLIENT_ID, ...fields }).toString(),
    });
  const poll = (app: FastifyInstance, deviceCode: string) =>
    tokenRequest(app, { grant_type: DEVICE_GRANT_TYPE, device_code: deviceCode });

  it.each(['oauthGrants', 'oauthRefreshTokens', 'oauthAccessTokens'])(
    'retries on a new backend after a failed %s commit',
    async (collection) => {
      const fake = atomicFirestore();
      const first = await backend(fake);
      await first.store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
      const { userCode, deviceCode } = await approve(first.app);
      fake.failNextCommitCreating(collection);
      expect((await poll(first.app, deviceCode)).statusCode).toBe(500);
      expect(await first.store.getOAuthDeviceAuthorization(userCode, clock)).toMatchObject({ ownerUid: 'g:boss' });
      expect(
        [...fake.docs.keys()].filter((key) => /^(oauthGrants|oauthRefreshTokens|oauthAccessTokens)\//.test(key)),
      ).toEqual([]);

      await first.app.close();
      apps.splice(apps.indexOf(first.app), 1);
      clock += 5_000;
      const retry = await backend(fake);
      const exchanged = await poll(retry.app, deviceCode);
      expect(exchanged.statusCode).toBe(200);
      const tokens = exchanged.json();
      const grants = await retry.store.listOAuthGrantsByOwner('g:boss');
      expect(grants).toHaveLength(1);
      expect(grants[0]!.currentRefreshTokenId).not.toBe('');
      expect(grants[0]!.currentRefreshHash).not.toBe('');
      expect(await retry.store.getOAuthDeviceAuthorization(userCode, clock)).toBeNull();
      expect([...fake.docs.keys()].filter((key) => key.startsWith('oauthDeviceCodes/'))).toEqual([]);
      expect((await poll(retry.app, deviceCode)).json()).toEqual({ error: 'invalid_grant' });
      expect(
        (
          await retry.app.inject({
            method: 'GET',
            url: '/api/me/profile',
            headers: { authorization: `Bearer ${tokens.access_token}` },
          })
        ).statusCode,
      ).toBe(200);
      const refreshed = await tokenRequest(retry.app, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      });
      expect(refreshed.statusCode).toBe(200);
      expect(refreshed.json().refresh_token).not.toBe(tokens.refresh_token);
    },
  );

  it('issues one complete grant when exchanges on separate Firestore backends race', async () => {
    const fake = atomicFirestore();
    const first = await backend(fake),
      second = await backend(fake);
    await first.store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    const { deviceCode } = await approve(first.app);
    const replies = await Promise.all([poll(first.app, deviceCode), poll(second.app, deviceCode)]);
    expect(replies.map((reply) => reply.statusCode).sort()).toEqual([200, 400]);
    expect(await first.store.listOAuthGrantsByOwner('g:boss')).toHaveLength(1);
    expect([...fake.docs.keys()].filter((key) => key.startsWith('oauthAccessTokens/'))).toHaveLength(1);
    expect([...fake.docs.keys()].filter((key) => key.startsWith('oauthRefreshTokens/'))).toHaveLength(1);
  });

  for (const implementation of ['memory', 'firestore'] as const) {
    it.each(['same-code', 'owner-cap'])(
      `atomically enforces %s during ${implementation} completion races`,
      async (race) => {
        const fake = atomicFirestore();
        const first = implementation === 'memory' ? new InMemoryStore() : new FirestoreStore(fake.db);
        const second = implementation === 'memory' ? first : new FirestoreStore(fake.db);
        await first.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
        const candidate = async (
          userCode: string,
          hash: string,
          grantId: string,
          deviceName: string,
        ): Promise<DeviceTokenIssuanceInput> => {
          await first.createOAuthDeviceAuthorization(
            {
              userCode,
              deviceCodeHash: hash,
              clientId: GAMEDEV_CLI_CLIENT_ID,
              scope: 'creator',
              deviceName,
              expiresAtMs: clock + 600_000,
              intervalSec: 5,
            },
            clock,
            64,
          );
          await first.decideOAuthDeviceAuthorization(userCode, { ownerUid: 'g:boss' }, clock);
          const grant = {
            grantId,
            clientId: GAMEDEV_CLI_CLIENT_ID,
            ownerUid: 'g:boss',
            scope: 'creator',
            createdAt: new Date(clock).toISOString(),
            refreshFamilyId: grantId,
            currentRefreshTokenId: `${grantId}-refresh`,
            currentRefreshHash: 'refresh-hash',
            refreshExpiresAt: new Date(clock + 600_000).toISOString(),
            deviceName,
          };
          return {
            deviceCodeHash: hash,
            grant,
            maxPerOwner: 1,
            nowMs: clock,
            accessToken: {
              tokenId: `${grantId}-access`,
              grantId,
              ownerUid: 'g:boss',
              secretHash: 'access-hash',
              createdAt: grant.createdAt,
              expiresAt: grant.refreshExpiresAt,
            },
          };
        };
        const input = await candidate('BCDF-GHJK', 'first-hash', 'first-grant', 'box');
        const other =
          race === 'same-code' ? input : await candidate('LMNP-QRST', 'second-hash', 'second-grant', 'other-box');
        const issued = await Promise.all([
          first.completeOAuthDeviceAuthorization(input),
          second.completeOAuthDeviceAuthorization(other),
        ]);
        expect(issued).toContainEqual({ ok: true });
        expect(issued).toContainEqual({ ok: false, error: race === 'same-code' ? 'invalid_grant' : 'access_denied' });
        expect(await first.listOAuthGrantsByOwner('g:boss')).toHaveLength(1);
      },
    );
  }

  async function holdGrants(store: InMemoryStore | FirestoreStore, count: number) {
    for (let i = 0; i < count; i++) {
      await store.createOAuthGrant({
        grantId: `held-${i}`,
        clientId: GAMEDEV_CLI_CLIENT_ID,
        ownerUid: 'g:boss',
        scope: 'creator',
        createdAt: new Date(clock).toISOString(),
        refreshFamilyId: `held-${i}`,
        currentRefreshTokenId: `held-${i}-refresh`,
        currentRefreshHash: 'hash',
        refreshExpiresAt: new Date(clock + 600_000).toISOString(),
        deviceName: `box-${i}`,
      });
    }
  }

  for (const implementation of ['memory', 'firestore'] as const) {
    it(`replaces the same device's grant on repeated ${implementation} sign-ins`, async () => {
      const store = implementation === 'memory' ? new InMemoryStore() : new FirestoreStore(atomicFirestore().db);
      const app = await buildOAuthApp(store, { now: () => clock });
      apps.push(app);
      await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
      await holdGrants(store, 9);
      let previous: string | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        clock += 10_000;
        const { deviceCode } = await approve(app);
        clock += 5_000;
        const exchanged = await poll(app, deviceCode);
        expect(exchanged.statusCode).toBe(200);
        const { access_token: accessToken } = exchanged.json();
        const me = (token: string) =>
          app.inject({ method: 'GET', url: '/api/me/profile', headers: { authorization: `Bearer ${token}` } });
        expect((await me(accessToken)).statusCode).toBe(200);
        if (previous) expect((await me(previous)).statusCode).toBe(401);
        previous = accessToken;
      }
      expect(await store.listOAuthGrantsByOwner('g:boss')).toHaveLength(10);
    });
  }

  it('keeps the code pending when the owner already holds the grant cap', async () => {
    const store = new InMemoryStore();
    const app = await buildOAuthApp(store, { now: () => clock });
    apps.push(app);
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    await holdGrants(store, 10);
    await expect(approve(app)).rejects.toThrow();
    const created = await app.inject({
      method: 'POST',
      url: '/oauth/device',
      payload: { client_id: GAMEDEV_CLI_CLIENT_ID },
    });
    const { user_code: userCode } = created.json();
    const approved = await app.inject({
      method: 'POST',
      url: '/device',
      headers: { cookie: sessionCookie('g:boss') },
      payload: {
        user_code: userCode,
        action: 'approve',
        disclosed_scope: 'creator',
        consent_token: consentToken({
          uid: 'g:boss',
          clientId: GAMEDEV_CLI_CLIENT_ID,
          codeChallenge: 'device',
          secret: SESSION_SECRET,
        }),
      },
    });
    expect(approved.body).toContain('Too many connected clients');
    expect(await store.getOAuthDeviceAuthorization(userCode, clock)).not.toMatchObject({ ownerUid: 'g:boss' });
  });

  it('ends open agent sessions when a creator sign-in replaces an mcp grant', async () => {
    const store = new InMemoryStore();
    const app = await buildOAuthApp(store, { now: () => clock });
    apps.push(app);
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    const ended = vi.spyOn(store, 'listSubmissionsByOwner');
    const signIn = async (scope: string) => {
      clock += 10_000;
      const { deviceCode } = await approve(app, scope);
      clock += 5_000;
      expect((await poll(app, deviceCode)).statusCode).toBe(200);
    };
    await signIn('mcp creator');
    await signIn('mcp creator');
    expect(ended).not.toHaveBeenCalled();
    await signIn('creator');
    expect(ended).toHaveBeenCalledWith('g:boss');
  });
});
