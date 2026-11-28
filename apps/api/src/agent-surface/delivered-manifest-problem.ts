import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';

// The gate's parser (catalog/parse-game-manifest.ts) throws on an engine.modules list that
// names an unknown module, repeats one, or leaves the canonical order. Staging only hints,
// and a hint on a signed-URL PUT reply is easy to miss, so a delivery the gate would refuse
// for that reason is refused here, before a build is spent on it.
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
