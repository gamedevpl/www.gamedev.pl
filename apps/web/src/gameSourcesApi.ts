/**
 * Sources client — the public read-only view of a published game's code.
 *
 * Uncredentialed, like the page read: the code of a published creator game is public
 * (ops `docs/game-page-plan.md`), so the request carries nothing that identifies a
 * reader and the response is the same for everyone.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GameSourceFile {
  path: string;
  bytes: number;
  language: 'typescript' | 'json' | 'css' | 'html' | 'markdown' | 'text';
}

export interface GameSources {
  version: string;
  files: GameSourceFile[];
  totalBytes: number;
}

export interface GameSourceContent extends GameSourceFile {
  version: string;
  content: string;
}

export async function fetchGameSources(slug: string): Promise<GameSources> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/sources`);
  if (response.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (!response.ok) throw new Error(`sources request failed: ${response.status}`);
  return (await response.json()) as GameSources;
}

export async function fetchGameSourceFile(slug: string, path: string): Promise<GameSourceContent> {
  const response = await fetch(
    `${API_BASE}/api/games/${encodeURIComponent(slug)}/sources/file?path=${encodeURIComponent(path)}`,
  );
  if (response.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (response.status === 413) throw Object.assign(new Error('too_large'), { code: 'too_large' });
  if (!response.ok) throw new Error(`source file request failed: ${response.status}`);
  return (await response.json()) as GameSourceContent;
}
