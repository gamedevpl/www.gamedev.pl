import { describe, expect, it } from 'vitest';
import {
  hasPublishableProfile,
  isReservedHandle,
  isValidHandle,
  normalizeHandle,
  profileBylineName,
  resolveAvatarUrl,
  sanitizeProfileBio,
  sanitizeProfileName,
  toPublicCreatorProfile,
  validateHandleShape,
} from './creator-profile.js';
import { InMemoryStore } from './platform/store.js';

describe('creator-profile validation', () => {
  it('accepts lowercase handles with underscores', () => {
    expect(isValidHandle('ada')).toBe(true);
    expect(isValidHandle('ada_lovelace')).toBe(true);
    expect(isValidHandle('a12')).toBe(true);
  });

  it('rejects short, uppercase, hyphenated, and reserved handles', () => {
    expect(isValidHandle('ab')).toBe(false);
    expect(isValidHandle('Ada')).toBe(false);
    expect(isValidHandle('ada-lovelace')).toBe(false);
    expect(isReservedHandle('creators')).toBe(true);
    expect(validateHandleShape('Admin')).toBe('reserved');
    expect(validateHandleShape('!!')).toBe('invalid');
  });

  it('sanitizes name and bio length', () => {
    expect(sanitizeProfileName('  Ada   Lovelace  ')).toBe('Ada Lovelace');
    expect(sanitizeProfileBio('x'.repeat(400)).length).toBe(280);
  });

  it('resolves avatar from google picture only when opted in', () => {
    expect(resolveAvatarUrl({ avatarMode: 'google', picture: 'https://example/p.jpg' })).toBe('https://example/p.jpg');
    expect(resolveAvatarUrl({ avatarMode: 'letter', picture: 'https://example/p.jpg' })).toBeNull();
    // Unset mode defaults to lettermark — a claim must not publish Google's picture.
    expect(resolveAvatarUrl({ picture: 'https://example/p.jpg' })).toBeNull();
    expect(resolveAvatarUrl({ picture: undefined })).toBeNull();
  });

  it('builds a public profile without leaking email', () => {
    const profile = toPublicCreatorProfile({
      handle: 'ada',
      profileName: 'Ada L.',
      bio: 'Builder',
      picture: 'https://example/p.jpg',
      avatarMode: 'google',
      createdAt: '2026-01-01T00:00:00.000Z',
      profileCreatedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(profile).toEqual({
      handle: 'ada',
      profileName: 'Ada L.',
      bio: 'Builder',
      avatarUrl: 'https://example/p.jpg',
      profileCreatedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(hasPublishableProfile({ handle: 'ada' })).toBe(true);
    expect(hasPublishableProfile({ handle: undefined })).toBe(false);
    expect(profileBylineName({ handle: 'ada' })).toBe('ada');
  });
});

describe('InMemoryStore handle claims', () => {
  it('claims uniquely and releases the old handle on rename', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:a', name: 'A' });
    await store.upsertUser({ uid: 'g:b', name: 'B' });

    const first = await store.claimHandle('g:a', 'ada', '2026-08-01T00:00:00.000Z');
    expect(first.ok).toBe(true);
    expect(await store.getUserByHandle('ada')).toMatchObject({ uid: 'g:a' });

    const taken = await store.claimHandle('g:b', 'Ada', '2026-08-01T00:00:00.000Z');
    expect(taken).toEqual({ ok: false, reason: 'taken' });

    // Rename before cooldown ends is refused.
    const early = await store.claimHandle('g:a', 'lovelace', '2026-08-02T00:00:00.000Z');
    expect(early).toEqual({ ok: false, reason: 'cooldown' });

    const renamed = await store.claimHandle('g:a', 'lovelace', '2026-09-05T00:00:00.000Z');
    expect(renamed.ok).toBe(true);
    expect(await store.getUserByHandle('lovelace')).toMatchObject({ uid: 'g:a' });
    // Old handle is held for the cooldown window.
    expect(await store.getUserByHandle('ada')).toBeNull();
    const stillHeld = await store.claimHandle('g:b', 'ada', '2026-09-06T00:00:00.000Z');
    expect(stillHeld).toEqual({ ok: false, reason: 'taken' });

    const freed = await store.claimHandle('g:b', 'ada', '2026-10-10T00:00:00.000Z');
    expect(freed.ok).toBe(true);
  });

  it('preserves profile fields across upsertUser (sign-in)', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:a', name: 'Google Name', picture: 'https://g/p' });
    await store.claimHandle('g:a', 'ada', '2026-08-01T00:00:00.000Z');
    await store.updateCreatorProfile('g:a', { profileName: 'Ada', bio: 'Hi', avatarMode: 'letter' });

    const again = await store.upsertUser({ uid: 'g:a', name: 'New Google Name', picture: 'https://g/p2' });
    expect(again.handle).toBe('ada');
    expect(again.profileName).toBe('Ada');
    expect(again.bio).toBe('Hi');
    expect(again.avatarMode).toBe('letter');
    expect(again.name).toBe('New Google Name');
    expect(normalizeHandle(' Ada ')).toBe('ada');
  });
});
