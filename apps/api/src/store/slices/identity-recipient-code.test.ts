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
    // beginAccountErasure alone, not the full sweep: the user document is
    // still there, so this exercises the fence check, not just "no user".
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    await store.beginAccountErasure('g:ada', '2026-01-01T00:00:00.000Z');

    expect(await store.ensureRecipientCode('g:ada', '2026-01-02T00:00:00.000Z')).toBeNull();
    expect(await store.rotateRecipientCode('g:ada', '2026-01-02T00:00:00.000Z')).toBeNull();
  });

  it('account erasure retires the recipient code', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada' });
    const code = await store.ensureRecipientCode('g:ada', '2026-01-01T00:00:00.000Z');

    await store.deleteAccountIdentity('g:ada', '2026-01-02T00:00:00.000Z');

    expect(await store.getUserByRecipientCode(code!)).toBeNull();
  });
});
