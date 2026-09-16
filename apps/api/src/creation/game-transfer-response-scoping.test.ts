// The scoping half of the transfer routes: which offer a response answers.

import { afterEach, describe, expect, it } from 'vitest';
import {
  appFactory,
  authCookie,
  ownedGameWithRecipientCode,
  stripInvitationId,
} from './game-transfer-routes.harness.js';

describe('a transfer response names the offer it answers', () => {
  const { appWith, closeAll } = appFactory();
  afterEach(closeAll);

  it('a replayed answer cannot land on an offer it never saw', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);

    const first = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    const staleId = first.json().transfer.invitationId;

    // Taken back, then offered again: a second decision on the same slug.
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer/cancel',
      headers: { cookie: authCookie('g:ada') },
      payload: { invitationId: staleId },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(second.json().transfer.invitationId).not.toBe(staleId);

    const replayed = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:grace') },
      payload: { invitationId: staleId },
    });

    expect(replayed.statusCode).toBe(404);
    // The live offer is untouched: nobody answered it.
    expect((await store.getActiveGameTransfer('sky', new Date().toISOString()))?.status).toBe('pending');
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');
  });

  it('an answer naming no offer cannot land on one that has an id', async () => {
    // Omission is the old shape, not an opt-out.
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const unscoped = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:grace') },
      payload: {},
    });

    expect(unscoped.statusCode).toBe(409);
    expect(unscoped.json().error).toBe('stale_client');
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');
  });

  it('still lets an invitation written before ids existed be answered', async () => {
    // Otherwise every open offer is stranded until its seven-day expiry.
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    await stripInvitationId(store, 'sky');

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:grace') },
      payload: {},
    });

    expect(accepted.statusCode).toBe(200);
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:grace');
  });

  it('tells a client left behind by a deploy to refresh, not that the offer is gone', async () => {
    // A cached shell can create an invitation but answer without its id.
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const answered = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:grace') },
      payload: {},
    });

    expect(answered.statusCode).toBe(409);
    expect(answered.json().error).toBe('stale_client');
    // Still refused: the offer did not move.
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');
  });

  it('tells a stranger nothing about whether a slug ever had a transfer', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    await store.upsertUser({ uid: 'g:stranger' });
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });

    const probe = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:stranger') },
      payload: {},
    });

    // The same answer a slug with no transfer at all would give.
    expect(probe.statusCode).toBe(404);
    expect(probe.json().error).toBe('not_found');
  });

  it('calls a genuinely finished invitation gone, not stale', async () => {
    const { store, code } = await ownedGameWithRecipientCode();
    const app = await appWith(store);
    const opened = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/transfer/cancel',
      headers: { cookie: authCookie('g:ada') },
      payload: { invitationId: opened.json().transfer.invitationId },
    });

    const late = await app.inject({
      method: 'POST',
      url: '/api/me/transfers/sky/accept',
      headers: { cookie: authCookie('g:grace') },
      payload: {},
    });

    expect(late.statusCode).toBe(404);
    expect(late.json().error).toBe('not_found');
  });
});
