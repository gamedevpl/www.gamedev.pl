import type { RemixMode } from '@gamedevpl/contract';

export type { RemixMode };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// Owner and admin routes share one shape; admins reach any game.
export type RemixScope = 'owner' | 'admin';

function remixPath(slug: string, scope: RemixScope): string {
  const base = scope === 'admin' ? 'admin/games' : 'me/games';
  return `${API_BASE}/api/${base}/${encodeURIComponent(slug)}/remix`;
}

// Remix is off by default; anything but 'on' reads as off.
export async function getRemixMode(slug: string, scope: RemixScope = 'owner'): Promise<RemixMode> {
  const response = await fetch(remixPath(slug, scope), { credentials: 'include' });
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  const { mode } = (await response.json()) as { mode?: RemixMode };
  return mode === 'on' ? 'on' : 'off';
}

export async function setRemixMode(slug: string, mode: RemixMode, scope: RemixScope = 'owner'): Promise<void> {
  const response = await fetch(remixPath(slug, scope), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
}
