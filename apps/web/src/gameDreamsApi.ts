const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// Concept sketches for one game; the bell's switch covers every game.
export interface GameDreams {
  on: boolean;
  accountMuted: boolean;
}

type Listener = (slug: string, dreams: GameDreams) => void;
const listeners = new Set<Listener>();

// The rail and the card share one switch.
export function onGameDreamsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function read(response: Response): Promise<GameDreams> {
  if (!response.ok) throw Object.assign(new Error(`Request failed (${response.status})`), { status: response.status });
  return (await response.json()) as GameDreams;
}

export async function fetchGameDreams(slug: string): Promise<GameDreams> {
  return read(await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/dreams`, { credentials: 'include' }));
}

export async function setGameDreams(slug: string, on: boolean): Promise<GameDreams> {
  const dreams = await read(
    await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/dreams`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ on }),
    }),
  );
  for (const listener of listeners) listener(slug, dreams);
  return dreams;
}
