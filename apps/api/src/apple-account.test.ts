import { describe, expect, it } from 'vitest';
import { linkableAppleEmail, resolveAppleAccount } from './apple-account.js';
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
  it('links onto the Google account holding the same verified email', async () => {
    // The whole point: this creator's games hang off g:google-sub, and an Apple button
    // that ignored that would show them an empty account.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com', name: 'Creator' });

    const resolution = await resolveAppleAccount(store, payload());

    expect(resolution.uid).toBe('g:google-sub');
    expect(resolution.linkedTo?.uid).toBe('g:google-sub');
  });

  it('matches regardless of the casing either provider used', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:google-sub', email: 'Creator@Example.com' });

    const resolution = await resolveAppleAccount(store, payload({ email: 'creator@example.com' }));

    expect(resolution.uid).toBe('g:google-sub');
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

  it('keeps an existing Apple account rather than re-linking it later', async () => {
    // A previous sign-in declined to link and created a:<sub>. If a Google account with
    // the same address appears afterwards, this creator must stay where their work is
    // instead of being moved between accounts from one sign-in to the next.
    const store = new InMemoryStore();
    await store.upsertUser({ uid: `a:${APPLE_SUB}`, email: 'creator@example.com' });
    await store.upsertUser({ uid: 'g:google-sub', email: 'creator@example.com' });

    const resolution = await resolveAppleAccount(store, payload());

    expect(resolution.uid).toBe(`a:${APPLE_SUB}`);
    expect(resolution.linkedTo).toBeUndefined();
  });

  it('reports the address the caller may allowlist and store', async () => {
    const linked = await resolveAppleAccount(new InMemoryStore(), payload());
    expect(linked.email).toBe('creator@example.com');

    const relay = await resolveAppleAccount(new InMemoryStore(), payload({ isPrivateEmail: true }));
    expect(relay.email).toBeUndefined();
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
