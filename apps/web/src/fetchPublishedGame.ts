import { readResponseBody, type FetchProgress } from './fetchProgress.js';
import type { PublishedGame } from './catalog.js';

export type { FetchProgress };
export type GameFetchError = Error & { status?: number };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // Non-JSON error bodies fall through to the status-based fallback.
  }
  return fallback;
}

export async function fetchPublishedGame(
  slug: string,
  options?: { onProgress?: (progress: FetchProgress) => void; signal?: AbortSignal },
): Promise<PublishedGame> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}`, {
    credentials: 'include',
    ...(options?.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    const error = new Error(
      await readApiErrorMessage(response, `Game request failed (${response.status})`),
    ) as GameFetchError;
    error.status = response.status;
    throw error;
  }

  const text = await readResponseBody(response, options?.onProgress);
  let body: PublishedGame;
  try {
    body = JSON.parse(text) as PublishedGame;
  } catch {
    throw new Error('Game response was malformed');
  }
  if (typeof body?.html !== 'string' || typeof body?.title !== 'string') {
    throw new Error('Game response was malformed');
  }
  return body;
}
