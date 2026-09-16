import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../platform/store.js';
import { authCookie, sessionSecret } from './game-transfer-routes.harness.js';
import { buildApp } from '../platform/app.js';

const AT = '2026-01-01T00:00:00.000Z';
const SLUG = 'sky';

describe('game transfer proposal routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function seeded() {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada', profileName: 'Ada' });
    await store.upsertUser({ uid: 'g:grace', profileName: 'Grace' });
    await store.upsertUser({ uid: 'g:bea' });
    await store.ensureGameAccess(SLUG, 'g:ada', AT, AT);
    await store.createSubmission(1, 'g:ada', 'Sky');
    await store.setSubmissionSlug(1, SLUG);
    const code = (await store.ensureRecipientCode('g:grace', AT))!;
    const proposed = await store.proposeGameTransfer({
      slug: SLUG,
      ownerUid: 'g:ada',
      accessRevision: 1,
      expectedAccessVersion: 'v1',
      idempotencyKey: 'k1',
      at: AT,
    });
    if (!proposed.ok) throw new Error('unreachable');
    const app = await buildApp({
      store,
      sessionSecret,
      gameTransferRoutes: { now: () => Date.parse(AT) },
      submissionRoutes: { submissionTokenSecret: 'dev-token-secret' },
    });
    apps.push(app);
    return { store, app, code, proposalId: proposed.proposal.proposalId };
  }

  function url(proposalId: string) {
    return `/api/me/studio/games/${SLUG}/transfer/propose/${proposalId}`;
  }

  it('requires a signed-in session', async () => {
    const { app, proposalId } = await seeded();
    const get = await app.inject({ method: 'GET', url: url(proposalId) });
    const post = await app.inject({
      method: 'POST',
      url: url(proposalId),
      payload: { recipientCode: 'XXXX-YYYY' },
    });
    expect(get.statusCode).toBe(401);
    expect(post.statusCode).toBe(401);
  });

  it('hides a missing proposal the same way as another owner’s', async () => {
    const { app } = await seeded();
    const missing = await app.inject({
      method: 'GET',
      url: url(randomUUID()),
      headers: { cookie: authCookie('g:ada') },
    });
    const other = await app.inject({
      method: 'GET',
      url: url(randomUUID()),
      headers: { cookie: authCookie('g:grace') },
    });
    expect(missing.statusCode).toBe(404);
    expect(other.statusCode).toBe(404);
    expect(missing.json()).toEqual(other.json());
  });

  it('lets the owner confirm through the existing invitation protocol', async () => {
    const { app, code, proposalId } = await seeded();
    const get = await app.inject({
      method: 'GET',
      url: url(proposalId),
      headers: { cookie: authCookie('g:ada') },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().proposal.status).toBe('ready');
    expect(JSON.stringify(get.json())).not.toContain('g:ada');
    const post = await app.inject({
      method: 'POST',
      url: url(proposalId),
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json().transfer).toMatchObject({ slug: SLUG, status: 'pending', you: 'sender' });
    expect(JSON.stringify(post.json())).not.toContain('g:grace');
    expect(JSON.stringify(post.json())).not.toContain(code);
  });

  it('refuses a cross-site cookie POST', async () => {
    const { app, code, proposalId } = await seeded();
    const res = await app.inject({
      method: 'POST',
      url: url(proposalId),
      headers: { cookie: authCookie('g:ada'), origin: 'https://evil.example' },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'untrusted request origin' });
  });

  it('refuses an editor and a stale owner after membership change', async () => {
    const { store, app, code, proposalId } = await seeded();
    const editorCode = (await store.ensureRecipientCode('g:bea', AT))!;
    await store.createEditorInvitation(SLUG, 'g:ada', 'g:bea', AT, editorCode);
    const invite = (await store.getEditorInvite(SLUG, 'g:bea', AT))!;
    await store.acceptEditorInvitation(SLUG, 'g:bea', AT, invite.inviteId);
    const asEditor = await app.inject({
      method: 'POST',
      url: url(proposalId),
      headers: { cookie: authCookie('g:bea') },
      payload: { recipientCode: code },
    });
    expect(asEditor.statusCode).toBe(404);
    const asOwner = await app.inject({
      method: 'POST',
      url: url(proposalId),
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(asOwner.statusCode).toBe(409);
    expect(asOwner.json().error).toBe('stale_owner');
  });

  it('refuses a blocked recipient and does not mint an invitation', async () => {
    const { store, app, code, proposalId } = await seeded();
    await store.upsertUser({ uid: 'g:grace', tier: 'blocked' });
    const res = await app.inject({
      method: 'POST',
      url: url(proposalId),
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('recipient_ineligible');
    expect(await store.getActiveGameTransfer(SLUG, AT)).toBeNull();
  });

  it('reports an invalidated proposal instead of an expiry', async () => {
    const { store, app, proposalId } = await seeded();
    await store.invalidateOpenTransferProposalsForSlug(SLUG, AT);
    const res = await app.inject({
      method: 'GET',
      url: url(proposalId),
      headers: { cookie: authCookie('g:ada') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposal.status).toBe('invalidated');
  });

  it('cancels the invitation when proposal confirm cannot finish', async () => {
    const { store, app, code, proposalId } = await seeded();
    store.confirmTransferProposal = async () => null;
    const res = await app.inject({
      method: 'POST',
      url: url(proposalId),
      headers: { cookie: authCookie('g:ada') },
      payload: { recipientCode: code },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('expired');
    const leftover = await store.getActiveGameTransfer(SLUG, AT);
    expect(leftover?.status).toBe('cancelled');
  });
});
