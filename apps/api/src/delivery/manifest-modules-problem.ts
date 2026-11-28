import { GAME_KIT_MODULES } from '../platform/games-repo-contract.js';

// Names the engine.modules defect the gate's assembler would refuse.
export function manifestModulesProblem(content: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return `GAME.json is not valid JSON (${error instanceof Error ? error.message : String(error)}), so the gate cannot read it.`;
  }
  const modules = (parsed as { engine?: { modules?: unknown } } | null)?.engine?.modules;
  // The preview check refuses a missing array.
  if (!Array.isArray(modules)) return null;
  const known = GAME_KIT_MODULES as readonly string[];
  const unknown = modules.find((name) => typeof name !== 'string' || !known.includes(name));
  if (unknown !== undefined) {
    return `GAME.json engine.modules lists ${JSON.stringify(unknown)}, which is not a GameKit module. Remove it or fix the name.`;
  }
  if (new Set(modules).size !== modules.length) {
    return 'GAME.json engine.modules has a duplicate entry: list each module once.';
  }
  const expected = known.filter((name) => modules.includes(name));
  if (modules.join(',') !== expected.join(',')) {
    return (
      'GAME.json engine.modules is out of order, and the gate refuses that before it builds. ' +
      `Reorder to: ${JSON.stringify(expected)}.`
    );
  }
  return null;
}
