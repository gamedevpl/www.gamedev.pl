import { describe, expect, it } from 'vitest';
import { appleLinkRefusal, linkableAppleEmail, resolveAppleAccount } from './apple-account.js';
import type { AppleAuthPayload } from './apple-auth.js';
import { InMemoryStore } from './store.js';

const APPLE_SUB = '001234.abcdef.0000';

function payload(overrides: Partial<AppleAuthPayload> = {}): AppleAuthPayload {
  return {
    sub: APPLE_SUB,
    email: 'creator@example.com',
    emailVerified: true,
    isPrivateEmail: false,
    ...overrides,
  };
}

describe('linkableAppleEmail', () => {
  it('accepts a verified, non-relay address', () => {
    expect(linkableAppleEmail(payload())).toBe('creator@example.com');
  });

  it('refuses an unverified address', () => {
    expect(linkableAppleEmail(payload({ emailVerified: false }))).toBeUndefined();
  });

  it('refuses a Hide-My-Email relay address', () => {
    expect(linkableAppleEmail(payload({ isPrivateEmail: true, email: 'x@privaterelay.appleid.com' }))).toBeUndefined();
  });

  it('refuses a relay address even when the is_private_email claim is missing', () => {
    // The claim is one of Apple's string-or-boolean ones, so the domain is checked on its
    // own rather than trusted to arrive.
    expect(linkableAppleEmail(payload({ isPrivateEmail: false, email: 'X@PrivateRelay.AppleID.com' }))).toBeUndefined();
  });

  it('refuses an absent or blank address', () => {
    expect(linkableAppleEmail(payload({ email: undefined }))).toBeUndefined();
    expect(linkableAppleEmail(payload({ email: '   ' }))).toBeUndefined();
  });
});

describe('resolveAppleAccount', () => {
  it('asks for a link instead of signing into a Google account by email alone', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com', name: 'Creator' });

    const resolution = await resolveAppleAccount(store, payload());

    expect(resolution.uid).toBe(`a:${APPLE_SUB}`);
    expect(resolution.linkRequired).toBe(true);
    expect(resolution.linkedTo).toBeUndefined();
  });

  it('asks for the link regardless of the casing either provider used', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'Creator@Example.com' });

    const resolution = await resolveAppleAccount(store, payload({ email: 'creator@example.com' }));

    expect(resolution.linkRequired).toBe(true);
  });

  it('signs into the account that linked this Apple ID, whatever its email', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'someone-else@example.com' });
    await store.setAppleSub('g:google-sub', APPLE_SUB);

    const resolution = await resolveAppleAccount(store, payload());

    expect(resolution.uid).toBe('g:google-sub');
    expect(resolution.linkedTo?.uid).toBe('g:google-sub');
    expect(resolution.linkRequired).toBeUndefined();
  });

  it('creates a fresh account when nothing matches', async () => {
    const resolution = await resolveAppleAccount(new InMemoryStore(), payload());

    expect(resolution.uid).toBe(`a:${APPLE_SUB}`);
    expect(resolution.linkedTo).toBeUndefined();
  });

  it('never links on an unverified email', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com' });

    const resolution = await resolveAppleAccount(store, payload({ emailVerified: false }));

    expect(resolution.uid).toBe(`a:${APPLE_SUB}`);
    expect(resolution.linkRequired).toBeUndefined();
    expect(resolution.email).toBeUndefined();
  });

  it('never links on a relay address', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com' });

    const resolution = await resolveAppleAccount(
      store,
      payload({ isPrivateEmail: true, email: 'abc@privaterelay.appleid.com' }),
    );

    expect(resolution.uid).toBe(`a:${APPLE_SUB}`);
    expect(resolution.linkRequired).toBeUndefined();
  });

  it('refuses to guess when two accounts share the address', async () => {
    // Signing somebody into the wrong one of two accounts is unrecoverable; handing them
    // a new account is not. So an ambiguous match falls through to a fresh uid.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:one', email: 'creator@example.com' });
    await store.upsertUser({ uid: 'g:two', email: 'creator@example.com' });

    const resolution = await resolveAppleAccount(store, payload());

    expect(resolution.uid).toBe(`a:${APPLE_SUB}`);
  });

  it('keeps an existing Apple account rather than asking to link it later', async () => {
    // If a Google account with the same address appears after a:<sub>, this creator must
    // stay where their work is.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: `a:${APPLE_SUB}`, email: 'creator@example.com' });
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com' });

    const resolution = await resolveAppleAccount(store, payload());

    expect(resolution.uid).toBe(`a:${APPLE_SUB}`);
    expect(resolution.linkedTo).toBeUndefined();
    expect(resolution.linkRequired).toBeUndefined();
  });

  it('reports the address the caller may allowlist and store', async () => {
    const linked = await resolveAppleAccount(new InMemoryStore(), payload());
    expect(linked.email).toBe('creator@example.com');

    const relay = await resolveAppleAccount(new InMemoryStore(), payload({ isPrivateEmail: true }));
    expect(relay.email).toBeUndefined();
  });
});

describe('appleLinkRefusal', () => {
  async function account(store: InMemoryStore, email = 'creator@example.com') {
    return store.upsertUser({ uid: 'g:google-sub', email });
  }

  it('allows a signed-in account to take an Apple ID with its own verified address', async () => {
    const store = new InMemoryStore();
    expect(await appleLinkRefusal(store, await account(store), payload())).toBeNull();
  });

  it('refuses an Apple ID whose address is not the account’s', async () => {
    const store = new InMemoryStore();
    const user = await account(store, 'owner@example.com');
    expect(await appleLinkRefusal(store, user, payload())).toBe('email_mismatch');
    expect(await appleLinkRefusal(store, user, payload({ email: 'owner@example.com', emailVerified: false }))).toBe(
      'email_mismatch',
    );
  });

  it('refuses an Apple ID that already has its own account', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: `a:${APPLE_SUB}`, email: 'creator@example.com' });
    expect(await appleLinkRefusal(store, await account(store), payload())).toBe('has_own_account');
  });

  it('refuses an Apple ID another account already linked', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:other', email: 'creator@example.com' });
    await store.setAppleSub('g:other', APPLE_SUB);
    expect(await appleLinkRefusal(store, await account(store), payload())).toBe('linked_elsewhere');
  });
});

describe('Apple subject binding', () => {
  it('survives later sign-ins', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com' });
    await store.setAppleSub('g:google-sub', APPLE_SUB);
    await store.upsertUser({ uid: 'g:google-sub', name: 'Renamed' });

    expect((await store.findUserByAppleSub(APPLE_SUB))?.uid).toBe('g:google-sub');
  });

  it('is held by one account at a time', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:one', email: 'creator@example.com' });
    await store.upsertUser({ uid: 'g:two', email: 'creator@example.com' });

    expect(await store.setAppleSub('g:one', APPLE_SUB)).toBe(true);
    expect(await store.setAppleSub('g:two', APPLE_SUB)).toBe(false);
    expect((await store.findUserByAppleSub(APPLE_SUB))?.uid).toBe('g:one');
  });

  it('is refused once the Apple ID has its own account', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com' });
    await store.upsertUser({ uid: `a:${APPLE_SUB}`, email: 'creator@example.com' });

    expect(await store.setAppleSub('g:google-sub', APPLE_SUB)).toBe(false);
  });

  it('is not created for an account that does not exist', async () => {
    const store = new InMemoryStore();
    await store.setAppleSub('g:missing', APPLE_SUB);
    expect(await store.findUserByAppleSub(APPLE_SUB)).toBeNull();
  });
});

describe('findUserByEmail', () => {
  it('is null for a blank query rather than matching a user with no email', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:no-email' });

    expect(await store.findUserByEmail('')).toBeNull();
    expect(await store.findUserByEmail('   ')).toBeNull();
  });
});
