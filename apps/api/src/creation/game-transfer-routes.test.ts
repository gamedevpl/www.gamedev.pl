import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { registerGameTransferRoutes } from './game-transfer-routes.js';
import {
  appFactory,
  AT,
  authCookie,
  offerId,
  ownedGameWithRecipientCode,
  sessionSecret,
} from './game-transfer-routes.harness.js';

describe('game transfer routes', () => {
  const { appWith, closeAll } = appFactory();
  afterEach(closeAll);

  it('a malformed slug is refused before it reaches the store', async () => {
    const { store } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio/games/Bad_Slug/transfer',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('the owner initiates a transfer by recipient code', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transfer).toMatchObject({ slug: 'sky', status: 'pending', you: 'sender' });
    // Null, not an English placeholder the client cannot translate.
    expect(res.json().transfer.counterparty).toEqual({ profileName: null });
  });

  it('names a counterparty who has one', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    await store.updateCreatorProfile('g:grace', { profileName: 'Grace Hopper' });
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    expect(res.json().transfer.counterparty.profileName).toBe('Grace Hopper');
  });

  it('tells the recipient an invitation is waiting', async () => {
    // Otherwise only someone who opens Studio ever knows.
    const { store, code } = await ownedGameWithRecipientCode();
    const offered: Array<{ uid: string; slug: string; gameTitle: string; invitedAt: string }> = [];
    const app = await appWith(store, { notifyTransferOffered: async (event) => void offered.push(event) });

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ uid: 'g:grace', slug: 'sky', gameTitle: 'sky' });
    // Keyed to this invitation, so a later one still lands.
    expect(offered[0].invitedAt).toEqual(expect.any(String));
  });

  it('keeps the invitation when telling the recipient fails', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store, {
      notifyTransferOffered: async () => {
        throw new Error('mailer down');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().transfer.status).toBe('pending');
  });

  it('never exposes either participant’s raw uid to the other', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('g:ada');
    expect(body).not.toContain('g:grace');
  });

  it('a non-owner cannot initiate', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    await store.upsertUser({ uid: 'g:mallory' });
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:mallory') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a malformed recipient code is refused before it reaches the store', async () => {
    const { store } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: 'not/a/valid/code' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_code');
  });

  it('an unknown recipient code is refused', async () => {
    const { store } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: 'rc_does-not-exist' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_code');
  });

  it('cannot transfer to yourself', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    const code = (await store.ensureRecipientCode('g:ada', AT))!;
    const app = await appWith(store);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('cannot_transfer_to_self');
  });

  it('a second initiation is refused while one is pending', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    const again = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(again.statusCode).toBe(409);
  });

  it('sender cancels; recipient rejects; both show up for their own inspect/incoming views', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    await store.upsertUser({ uid: 'g:stranger' });
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const incoming = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(incoming.json().transfers).toHaveLength(1);

    const inspectBySender = await app.inject({
      method: 'GET',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(inspectBySender.json().transfer.status).toBe('pending');

    const inspectByStranger = await app.inject({
      method: 'GET',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:stranger') },
    });
    expect(inspectByStranger.json().transfer).toBeNull();

    const cancel = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer/cancel',
      headers: { cookie: authCookie('g:ada') },
      payload: { invitationId: await offerId(store, 'sky') },
    });
    expect(cancel.json().transfer.status).toBe('cancelled');

    const cancelAgain = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer/cancel',
      headers: { cookie: authCookie('g:ada') },
      payload: { invitationId: await offerId(store, 'sky') },
    });
    expect(cancelAgain.statusCode).toBe(404);
  });

  it('caches the incoming-transfer inbox across polls within its window, and drops it on reject', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);
    const listSpy = vi.spyOn(store, 'listPendingGameTransfersForRecipient');

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(first.json().transfers).toHaveLength(1);
    expect(listSpy).toHaveBeenCalledTimes(1);

    // A second poll within the window must not repeat the collection scan.
    const second = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(second.json().transfers).toHaveLength(1);
    expect(listSpy).toHaveBeenCalledTimes(1);

    await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/reject',
      headers: { cookie: authCookie('g:grace') },
      payload: { invitationId: await offerId(store, 'sky') },
    });

    // The reject must invalidate the cache, not just the store.
    const third = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(third.json().transfers).toHaveLength(0);
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('the recipient can reject a pending invitation', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const reject = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/reject',
      headers: { cookie: authCookie('g:grace') },
      payload: { invitationId: await offerId(store, 'sky') },
    });
    expect(reject.json().transfer.status).toBe('rejected');

    const incoming = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(incoming.json().transfers).toHaveLength(0);
  });

  it('drops the cached inbox entry when the sender is erased mid-window', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    // Populates grace's cache with the pending invite, inside its window.
    const before = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(before.json().transfers).toHaveLength(1);

    // The sender's account is erased, which scrubs the invitation naming them.
    await store.deleteAccountIdentity('g:ada', AT);

    const after = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(after.json().transfers).toHaveLength(0);
  });

  it('the recipient can accept a pending invitation, moving canonical ownership', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const accept = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:grace') },
      payload: { invitationId: await offerId(store, 'sky') },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().transfer).toMatchObject({ slug: 'sky', status: 'accepted', you: 'recipient' });

    const access = await store.getGameAccess('sky');
    expect(access?.ownerUid).toBe('g:grace');

    // Accepting also drops the recipient's own cached inbox entry.
    const incoming = await app.inject({
      method: 'GET',
      url: '/api/me/transfers/incoming',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(incoming.json().transfers).toHaveLength(0);
  });

  it('accepting busts the catalog/game-play caches for the transferred slug', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = Fastify();
    app.addHook('preHandler', async (req) => {
      const cookie = req.headers.cookie as string | undefined;
      const token = cookie?.split(`${SESSION_COOKIE_NAME}=`)[1];
      req.user = token ? ({ uid: readSessionToken(token, sessionSecret).uid } as typeof req.user) : null;
    });
    const invalidatePublishedGameCaches = vi.fn();
    await registerGameTransferRoutes(app, { store, invalidatePublishedGameCaches });
    try {
      await app.inject({
        method: 'POST',
        url: '/api/me/studio/games/sky/transfer',
        headers: { cookie: authCookie('g:ada') },
        payload: { recipientCode: code },
      });
      expect(invalidatePublishedGameCaches).not.toHaveBeenCalled();

      const accept = await app.inject({
        method: 'POST',
        url: '/api/me/transfers/sky/accept',
        headers: { cookie: authCookie('g:grace') },
        payload: { invitationId: await offerId(store, 'sky') },
      });
      expect(accept.statusCode).toBe(200);
      expect(invalidatePublishedGameCaches).toHaveBeenCalledWith('sky');
    } finally {
      await app.close();
    }
  });

  it('the sender cannot accept their own invitation', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const accept = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:ada') },
      payload: { invitationId: await offerId(store, 'sky') },
    });
    expect(accept.statusCode).toBe(404);
  });

  it('transferred game disappears from sender studio shelf even when requested directly', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    await store.createSubmission(10, 'g:ada', 'Sky');
    await store.setSubmissionSlug(10, 'sky');
    const app = await appWith(store);

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:grace') },
      payload: { invitationId: await offerId(store, 'sky') },
    });
    // Without this the shelf assertions would pass for the wrong reason.
    expect(accepted.statusCode).toBe(200);

    const senderStudio = await app.inject({
      method: 'GET',
      url: '/api/me/studio?game=sky',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(senderStudio.statusCode).toBe(200);
    const senderGames = senderStudio.json().games as Array<{ slug?: string }>;
    expect(senderGames.map((g) => g.slug)).not.toContain('sky');

    const recipientStudio = await app.inject({
      method: 'GET',
      url: '/api/me/studio?game=sky',
      headers: { cookie: authCookie('g:grace') },
    });
    expect(recipientStudio.statusCode).toBe(200);
    const recipientGames = recipientStudio.json().games as Array<{ slug?: string }>;
    expect(recipientGames.map((g) => g.slug)).toContain('sky');
  });
});
