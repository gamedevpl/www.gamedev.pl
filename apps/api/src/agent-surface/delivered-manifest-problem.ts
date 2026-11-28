import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';

// Refuses at submit an engine.modules list the gate would reject.
export function deliveredManifestProblem(files: ReadonlyArray<{ path: string; content: string }>): string | null {
  const manifest = files.find((file) => file.path === 'GAME.json');
  if (!manifest) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest.content);
  } catch (error) {
    return `GAME.json is not valid JSON (${error instanceof Error ? error.message : String(error)}), so the gate cannot read it.`;
  }
  const engine = (parsed as { engine?: { modules?: unknown } } | null)?.engine;
  const modules = engine?.modules;
  if (!Array.isArray(modules)) return 'GAME.json has no engine.modules array, so the gate cannot assemble the game.';
  const known = GAME_KIT_MODULES as readonly string[];
  const unknown = modules.find((name) => typeof name !== 'string' || !known.includes(name));
  if (unknown !== undefined)
    return `GAME.json engine.modules lists ${JSON.stringify(unknown)}, which is not a GameKit module.`;
  if (new Set(modules).size !== modules.length)
    return 'GAME.json engine.modules has a duplicate entry: list each module once.';
  const expected = known.filter((name) => modules.includes(name));
  if (modules.join(',') !== expected.join(',')) {
    return (
      'GAME.json engine.modules is out of order, and the gate refuses that before it builds. ' +
      `Reorder to: ${JSON.stringify(expected)}.`
    );
  }
  return null;
}

// 2026-11-27: misordered modules reached the gate unread.
export function deliveredManifestRefusal(files: ReadonlyArray<{ path: string; content: string }>) {
  const error = deliveredManifestProblem(files);
  if (!error) return null;
  const retry = 'Fix GAME.json, stage it again, then call submit_sources again.';
  return { error, reason: 'game_manifest_invalid', retry };
}
