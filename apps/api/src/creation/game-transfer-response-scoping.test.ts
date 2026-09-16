// The scoping half of the transfer routes: which offer a response answers.

import { afterEach, describe, expect, it } from 'vitest';
import { appFactory, authCookie, ownedGameWithRecipientCode } from './game-transfer-routes.harness.js';

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

  it('refuses an answer that names no offer at all', async () => {
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
    });

    expect(unscoped.statusCode).toBe(400);
    expect(unscoped.json().error).toBe('invalid_invitation');
    expect((await store.getGameAccess('sky'))?.ownerUid).toBe('g:ada');
  });
});
