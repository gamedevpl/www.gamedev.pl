import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';

// Builders append modules; the gate's assembler needs canonical order.
export function canonicalGameManifest(file: { path: string; content: string }): { path: string; content: string } {
  if (file.path !== 'GAME.json') return file;
  let manifest: unknown;
  try {
    manifest = JSON.parse(file.content);
  } catch {
    return file;
  }
  const engine = (manifest as { engine?: { modules?: unknown } } | null)?.engine;
  const modules = engine?.modules;
  if (!Array.isArray(modules) || new Set(modules).size !== modules.length) return file;
  const known = GAME_KIT_MODULES as readonly unknown[];
  if (!modules.every((name) => known.includes(name))) return file;
  const ordered = GAME_KIT_MODULES.filter((name) => modules.includes(name));
  if (ordered.join(',') === modules.join(',')) return file;
  engine!.modules = ordered;
  return { path: file.path, content: `${JSON.stringify(manifest, null, 2)}\n` };
}
