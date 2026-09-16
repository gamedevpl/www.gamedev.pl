import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import { memberKey } from '../platform/game-access-permissions.js';

const sessionSecret = 'dev-session-secret-change-me';
const AT = '2026-01-01T00:00:00.000Z';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

describe('game editor invite routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function party() {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:bea' });
    await store.upsertUser({ uid: 'g:cal' });
    await store.upsertUser({ uid: 'g:dana' });
    await store.updateCreatorProfile('g:ada', { profileName: 'Ada' });
    await store.updateCreatorProfile('g:bea', { profileName: 'Bea' });
    await store.updateCreatorProfile('g:cal', { profileName: 'Cal' });
    await store.updateCreatorProfile('g:dana', { profileName: 'Dana' });
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    const beaCode = (await store.ensureRecipientCode('g:bea', AT))!;
    const calCode = (await store.ensureRecipientCode('g:cal', AT))!;
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);
    return { store, app, beaCode, calCode };
  }

  it('a malformed slug is refused before it reaches the store', async () => {
    const { app, beaCode } = await party();
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/Bad_Slug/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });
    expect(res.statusCode).toBe(400);
  });

  it('the owner invites by recipient code and never leaks uids', async () => {
    const { app, beaCode } = await party();
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().invite).toMatchObject({ slug: 'sky', status: 'pending', you: 'sender' });
    expect(res.json().invite.counterparty).toEqual({ profileName: 'Bea' });
    expect(res.json().invite.memberKey).toBe(memberKey('sky', 'g:bea'));
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('g:ada');
    expect(body).not.toContain('g:bea');
  });

  it('an editor cannot invite, and a stranger cannot list members', async () => {
    const { store, app, beaCode } = await party();
    await store.createEditorInvitation('sky', 'g:ada', 'g:bea', AT, beaCode);
    await store.acceptEditorInvitation('sky', 'g:bea', AT);

    const invite = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:bea') },
      payload: { recipientCode: (await store.ensureRecipientCode('g:cal', AT))! },
    });
    expect(invite.statusCode).toBe(403);
    expect(invite.json().error).toBe('not_owner');

    const strangers = await app.inject({
      method: 'GET',
      url: '/api/me/studio/games/sky/editors',
      headers: { cookie: authCookie('g:dana') },
    });
    expect(strangers.statusCode).toBe(403);
  });

  it('cannot invite yourself, and a duplicate pending invite is busy', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.upsertUser({ uid: 'g:bea' });
    await store.ensureGameAccess('sky', 'g:ada', AT, AT);
    const selfCode = (await store.ensureRecipientCode('g:ada', AT))!;
    const beaCode = (await store.ensureRecipientCode('g:bea', AT))!;
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);

    const self = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: selfCode },
    });
    expect(self.statusCode).toBe(400);
    expect(self.json().error).toBe('cannot_invite_self');

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });
    const again = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('busy');
  });

  it('incoming invites are listed for a user with no games of their own', async () => {
    const { app, beaCode } = await party();
    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });

    const incoming = await app.inject({
      method: 'GET',
      url: '/api/me/editor-invites/incoming',
      headers: { cookie: authCookie('g:bea') },
    });
    expect(incoming.statusCode).toBe(200);
    expect(incoming.json().invites).toHaveLength(1);
    expect(incoming.json().invites[0].you).toBe('recipient');
    expect(JSON.stringify(incoming.json())).not.toContain('g:ada');
  });

  it('accept, reject, cancel, remove and leave cover the membership loop', async () => {
    const { store, app, beaCode, calCode } = await party();

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/me/editor-invites/sky/accept',
      headers: { cookie: authCookie('g:bea') },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().invite.status).toBe('accepted');

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: calCode },
    });
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/me/editor-invites/sky/reject',
      headers: { cookie: authCookie('g:cal') },
    });
    expect(rejected.json().invite.status).toBe('rejected');

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: calCode },
    });
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/me/studio/games/sky/editors/invites/${memberKey('sky', 'g:cal')}/cancel`,
      headers: { cookie: authCookie('g:ada') },
    });
    expect(cancelled.json().invite.status).toBe('cancelled');

    const members = await app.inject({
      method: 'GET',
      url: '/api/me/studio/games/sky/editors',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(members.json().viewerRole).toBe('owner');
    expect(members.json().editors).toHaveLength(1);

    const removed = await app.inject({
      method: 'POST',
      url: `/api/me/studio/games/sky/editors/${memberKey('sky', 'g:bea')}/remove`,
      headers: { cookie: authCookie('g:ada') },
    });
    expect(removed.statusCode).toBe(200);

    await store.createEditorInvitation('sky', 'g:ada', 'g:cal', AT, calCode);
    await store.acceptEditorInvitation('sky', 'g:cal', AT);
    const left = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/leave',
      headers: { cookie: authCookie('g:cal') },
    });
    expect(left.statusCode).toBe(200);
    const ownerLeave = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/leave',
      headers: { cookie: authCookie('g:ada') },
    });
    expect(ownerLeave.statusCode).toBe(403);
  });

  it('a notify failure does not undo a saved invite', async () => {
    const { store, app, beaCode } = await party();
    vi.spyOn(store, 'createNotification').mockRejectedValue(new Error('mailer down'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });
    expect(res.statusCode).toBe(200);
    expect(await store.getEditorInvite('sky', 'g:bea', new Date().toISOString())).toMatchObject({
      status: 'pending',
    });
  });

  it('caches the incoming inbox across polls and drops it on reject', async () => {
    const { store, app, beaCode } = await party();
    const listSpy = vi.spyOn(store, 'listPendingEditorInvitesForRecipient');

    await app.inject({
      method: 'POST',
      url: '/api/me/studio/games/sky/editors/invites',
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: beaCode },
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/me/editor-invites/incoming',
      headers: { cookie: authCookie('g:bea') },
    });
    expect(first.json().invites).toHaveLength(1);
    expect(listSpy).toHaveBeenCalledTimes(1);

    const second = await app.inject({
      method: 'GET',
      url: '/api/me/editor-invites/incoming',
      headers: { cookie: authCookie('g:bea') },
    });
    expect(second.json().invites).toHaveLength(1);
    expect(listSpy).toHaveBeenCalledTimes(1);

    await app.inject({
      method: 'POST',
      url: '/api/me/editor-invites/sky/reject',
      headers: { cookie: authCookie('g:bea') },
    });
    const after = await app.inject({
      method: 'GET',
      url: '/api/me/editor-invites/incoming',
      headers: { cookie: authCookie('g:bea') },
    });
    expect(after.json().invites).toHaveLength(0);
  });
});
