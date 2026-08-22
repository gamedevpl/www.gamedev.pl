/**
 * Creator profiles — publish-gated public identity.
 *
 * Building and playtesting need none of this. Publishing does: a unique handle, a
 * display name, and a public page. Google/Apple account names never become bylines;
 * SPEC.md never carries identity. See www.gamedev.pl-ops docs/creator-profiles-plan.md.
 */

/** Lowercase handle: starts with a letter, then letters/digits/underscores. */
import type { AvatarMode } from '@gamedevpl/contract';

export const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;

export const PROFILE_NAME_MAX = 40;
export const PROFILE_BIO_MAX = 280;

/** How long after a rename before the old handle can be claimed by someone else. */
export const HANDLE_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Path segments, brand, and vocabulary a creator must not claim as a handle.
 * Kept lowercase; matching is case-insensitive after normalisation.
 */
/**
 * The handle platform-authored games live under, so every published game has an
 * address in the `/:handle/:slug` namespace.
 *
 * Most of the catalog predates creator profiles and has no owner to name; without a
 * fallback those games would have no game page at all, which would leave the whole
 * surface reachable only for games made after profiles shipped. It is a *namespace*,
 * not a profile: nobody signs in as it, and it stays in {@link RESERVED_HANDLES} below
 * so no creator can ever claim it.
 */
export const PLATFORM_HANDLE = 'gamedevpl';

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'anonymous',
  'api',
  'auth',
  'contact',
  'create',
  'creator',
  'creators',
  'dev',
  'draft',
  'gamedev',
  'gamedevpl',
  'health',
  'help',
  'invite',
  'join',
  'me',
  'null',
  'official',
  'party',
  'play',
  'platform',
  'privacy',
  // First-class product route (the proposer's tracker). Reserved for the same reason
  // `studio` and `play` are: `/proposals` resolves to that surface before the root-handle
  // fallback, so a claimed handle of this name would have an unreachable profile.
  'proposals',
  'review',
  'root',
  'status',
  'studio',
  'support',
  'system',
  'terms',
  'undefined',
  'www',
]);

export type { AvatarMode } from '@gamedevpl/contract';

export type HandleClaimRefusal = 'invalid' | 'reserved' | 'taken' | 'unchanged' | 'cooldown' | 'not_found';

export interface PublicCreatorProfile {
  handle: string;
  profileName: string;
  bio: string;
  /** Absolute URL when showing Google picture; null for lettermark. */
  avatarUrl: string | null;
  profileCreatedAt: string;
}

/** Normalise user input to the stored handle form, or null if empty. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle);
}

/**
 * Why a handle cannot be claimed, or null when the shape is fine (availability is
 * a separate store lookup).
 */
export function validateHandleShape(raw: string): 'invalid' | 'reserved' | null {
  const handle = normalizeHandle(raw);
  if (!isValidHandle(handle)) return 'invalid';
  if (isReservedHandle(handle)) return 'reserved';
  return null;
}

export function sanitizeProfileName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, PROFILE_NAME_MAX);
}

export function sanitizeProfileBio(raw: string): string {
  return raw.trim().replace(/\r\n/g, '\n').slice(0, PROFILE_BIO_MAX);
}

/**
 * Public avatar URL for a profile. Google picture only when the creator explicitly
 * opted into `avatarMode: 'google'` and one exists. Default is lettermark — claiming a
 * handle must not publish the Google picture until the creator chooses to.
 */
export function resolveAvatarUrl(input: { avatarMode?: AvatarMode; picture?: string }): string | null {
  const mode = input.avatarMode ?? 'letter';
  if (mode !== 'google') return null;
  const picture = input.picture?.trim();
  return picture || null;
}

/** Display name for bylines: profileName, else handle. */
export function profileBylineName(input: { profileName?: string; handle: string }): string {
  const name = input.profileName?.trim();
  return name || input.handle;
}

export function hasPublishableProfile(user: { handle?: string } | null | undefined): boolean {
  return Boolean(user?.handle && isValidHandle(user.handle));
}

export function toPublicCreatorProfile(user: {
  handle?: string;
  profileName?: string;
  bio?: string;
  picture?: string;
  avatarMode?: AvatarMode;
  profileCreatedAt?: string;
  createdAt: string;
}): PublicCreatorProfile | null {
  if (!user.handle || !isValidHandle(user.handle)) return null;
  return {
    handle: user.handle,
    profileName: profileBylineName({ profileName: user.profileName, handle: user.handle }),
    bio: user.bio?.trim() ?? '',
    avatarUrl: resolveAvatarUrl(user),
    profileCreatedAt: user.profileCreatedAt ?? user.createdAt,
  };
}
