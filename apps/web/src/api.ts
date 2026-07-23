export interface GeneratedGame {
  title: string;
  description: string;
  html: string;
}

export type GenerateGameApiError = Error & { category?: string };

/**
 * Local preview only. Games are not generated on demand in the real design —
 * they live in the games repo and are maintained there by coding agents
 * (see docs/games-repo.md). This backs the offline mock so the player surface
 * stays exercisable until the catalog lands.
 */
export async function generateGame(prompt: string): Promise<GeneratedGame> {
  const response = await fetch('/api/generate-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; category?: string } | null;
    const error = new Error(body?.error ?? `Request failed (${response.status})`) as GenerateGameApiError;
    error.category = body?.category;
    throw error;
  }

  return (await response.json()) as GeneratedGame;
}
