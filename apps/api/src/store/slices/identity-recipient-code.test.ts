import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../../platform/store.js';

describe('recipient code store slice', () => {
  it('is null for an account that does not exist', async () => {
    const store = new InMemoryStore();
    expect(await store.ensureRecipientCode('g:nobody', '2026-01-01T00:00:00.000Z')).toBeNull();
    expect(await store.rotateRecipientCode('g:nobody', '2026-01-01T00:00:00.000Z')).toBeNull();
  });

  it('mints a code lazily and returns the same one on later fetches', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });

    const first = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');
    const second = await store.ensureRecipientCode('g:ada', '2026-01-01T00:05:00.000Z');

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('resolves the code back to its owner', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada', name: 'Ada' });
    const code = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    const found = await store.getUserByRecipientCode(code!);
    expect(found?.uid).toBe('g:ada');
  });

  it('rotation mints a new code and retires the old one', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const original = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    const rotated = await store.rotateRecipientCode('g:ada', '2026-01-02T00:00:00.000Z');

    expect(rotated).not.toBe(original);
    expect(await store.getUserByRecipientCode(original!)).toBeNull();
    expect((await store.getUserByRecipientCode(rotated!))?.uid).toBe('g:ada');
  });

  it('an unknown code resolves to nobody', async () => {
    const store = new InMemoryStore();
    expect(await store.getUserByRecipientCode('rc_does-not-exist')).toBeNull();
  });

  it('a re-upsert (e.g. re-login) does not drop the recipient code', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada', name: 'Ada' });
    const code = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    await store.upsertUser({ uid: 'g:ada', name: 'Ada Lovelace' });

    const user = await store.getUser('g:ada');
    expect(user?.recipientCode).toBe(code);
    expect((await store.getUserByRecipientCode(code!))?.uid).toBe('g:ada');
  });

  it('refuses to mint or rotate a code once erasure has begun, even before cleanup runs', async () => {
    // Not the full sweep: the user still exists, testing the fence alone.
    const store = new InMemoryStore();
    // Erased from the moment it existed: the fence covers this incarnation.
    const ada = await store.upsertUser({ uid: 'g:ada' });
    await store.beginAccountErasure('g:ada', ada.createdAt);

    expect(await store.ensureRecipientCode('g:ada', '2026-01-02T00:00:00.000Z')).toBeNull();
    expect(await store.rotateRecipientCode('g:ada', '2026-01-02T00:00:00.000Z')).toBeNull();
  });

  it('stops returning an existing code once erasure begins, before cleanup removes it', async () => {
    const store = new InMemoryStore();
    const ada = await store.upsertUser({ uid: 'g:ada' });
    await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    await store.beginAccountErasure('g:ada', ada.createdAt);

    expect(await store.ensureRecipientCode('g:ada', '2026-01-03T00:00:00.000Z')).toBeNull();
  });

  it('lets an account that signed up again be handed a game', async () => {
    // Erasure deletes the user record, so this uid is a new account now.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');
    await store.deleteAccountIdentity('g:ada', '2026-01-02T00:00:00.000Z');

    await store.upsertUser({ uid: 'g:ada' });

    expect(await store.ensureRecipientCode('g:ada', '2026-03-01T00:00:00.000Z')).toBeTruthy();
  });

  it('still refuses the incarnation the erasure was about', async () => {
    // The fence is what stops a writer racing an erasure in flight.
    const store = new InMemoryStore();
    const ada = await store.upsertUser({ uid: 'g:ada' });
    await store.beginAccountErasure('g:ada', ada.createdAt);

    expect(await store.ensureRecipientCode('g:ada', '2026-06-02T00:00:00.000Z')).toBeNull();
    expect(await store.rotateRecipientCode('g:ada', '2026-06-02T00:00:00.000Z')).toBeNull();
  });

  it('account erasure retires the recipient code', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const code = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    await store.deleteAccountIdentity('g:ada', '2026-01-02T00:00:00.000Z');

    expect(await store.getUserByRecipientCode(code!)).toBeNull();
  });
});
