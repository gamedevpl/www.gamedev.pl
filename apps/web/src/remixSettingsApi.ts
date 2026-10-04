import type { RemixMode } from '@gamedevpl/contract';

export type { RemixMode };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function remixPath(slug: string): string {
  return `${API_BASE}/api/me/games/${encodeURIComponent(slug)}/remix`;
}

// Owner-only remix switch; anything but 'off' reads as on.
export async function getRemixMode(slug: string): Promise<RemixMode> {
  const response = await fetch(remixPath(slug), { credentials: 'include' });
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
  const { mode } = (await response.json()) as { mode?: RemixMode };
  return mode === 'off' ? 'off' : 'on';
}

export async function setRemixMode(slug: string, mode: RemixMode): Promise<void> {
  const response = await fetch(remixPath(slug), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) throw new Error(`request failed with ${response.status}`);
}
