/**
 * Creator profile client — claim handle, edit byline, load public pages.
 */

import type { AvatarMode } from '@gamedevpl/contract';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type { AvatarMode } from '@gamedevpl/contract';

export interface PublicCreatorProfile {
  handle: string;
  profileName: string;
  bio: string;
  avatarUrl: string | null;
  profileCreatedAt: string;
}

export interface MeProfile {
  profile: PublicCreatorProfile | null;
  publishReady: boolean;
  handle?: string;
  profileName?: string;
  bio?: string;
  avatarMode?: AvatarMode;
  handleChangedAt?: string;
  picture?: string | null;
}

export interface PublicCreatorPage {
  profile: PublicCreatorProfile;
  games: Array<{
    slug: string;
    title: string;
    genre: string;
    controls: string;
    status: string;
    media: unknown;
    submittedBy: string | null;
    creatorHandle?: string | null;
    orientation?: string;
    touch?: string | null;
    multiplayer?: unknown;
    saves?: unknown;
    world?: unknown;
    sensing?: unknown;
  }>;
}

export type HandleClaimError =
  'invalid' | 'reserved' | 'taken' | 'unchanged' | 'cooldown' | 'not_found' | 'handle_required' | 'unknown';

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // fall through
  }
  return 'unknown';
}

export async function fetchMyProfile(): Promise<MeProfile> {
  const response = await fetch(`${API_BASE}/api/me/profile`, { credentials: 'include' });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as MeProfile;
}

export async function claimHandle(handle: string): Promise<MeProfile> {
  const response = await fetch(`${API_BASE}/api/me/profile/handle`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  });
  if (!response.ok) {
    const code = asClaimError(await readError(response));
    throw Object.assign(new Error(code), { code });
  }
  return (await response.json()) as MeProfile;
}

export async function updateMyProfile(patch: {
  profileName?: string;
  bio?: string | null;
  avatarMode?: AvatarMode;
}): Promise<MeProfile> {
  const response = await fetch(`${API_BASE}/api/me/profile`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as MeProfile;
}

export async function checkHandleAvailability(
  handle: string,
): Promise<{ handle: string; available: boolean; reason?: HandleClaimError }> {
  const response = await fetch(`${API_BASE}/api/creators/${encodeURIComponent(handle)}/availability`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { handle: string; available: boolean; reason?: HandleClaimError };
}

export async function fetchCreatorPage(handle: string): Promise<PublicCreatorPage> {
  const response = await fetch(`${API_BASE}/api/creators/${encodeURIComponent(handle)}`);
  if (response.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as PublicCreatorPage;
}

function asClaimError(code: string): HandleClaimError {
  const known: HandleClaimError[] = [
    'invalid',
    'reserved',
    'taken',
    'unchanged',
    'cooldown',
    'not_found',
    'handle_required',
  ];
  return known.find((item) => item === code) ?? 'unknown';
}
