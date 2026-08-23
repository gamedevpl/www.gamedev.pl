import { GAME_KIT_MODULES } from './games-repo-contract.js';

// Shallow shape check — catches assemble.ts crashes before the gate does.

// index.html is refused elsewhere at write time — never reaches this check.
export function gameManifestHint(path: string, content: string): string | null {
  const normalized = path.trim().replaceAll('\\', '/');
  if (normalized !== 'GAME.json') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return `GAME.json is not valid JSON (${error instanceof Error ? error.message : String(error)}) — the gate will fail to read it before typecheck even runs.`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'GAME.json must be a JSON object.';
  }
  const manifest = parsed as Record<string, unknown>;

  const engine = manifest.engine;
  const modules =
    typeof engine === 'object' && engine !== null && !Array.isArray(engine)
      ? (engine as Record<string, unknown>).modules
      : undefined;
  if (!Array.isArray(modules) || modules.length === 0) {
    return (
      'GAME.json has no engine.modules array. The shared kit reads manifest.engine.modules unconditionally when ' +
      'assembling the game — a missing/empty array crashes preview smoke with "Cannot read properties of ' +
      "undefined (reading 'modules')\" before build or capture ever run, with no useful stack trace. Add " +
      '"engine": { "modules": [...] } naming only the modules game/*.ts actually imports (e.g. "input", "gfx").'
    );
  }
  if (!modules.every((m) => typeof m === 'string')) {
    return 'GAME.json engine.modules must contain only strings.';
  }

  // Mirrors parseGameManifest in github-client.ts.
  const unknown = modules.find((m) => !(GAME_KIT_MODULES as readonly string[]).includes(m as string));
  if (unknown) {
    return `GAME.json engine.modules lists "${unknown}", which is not a GameKit module. Remove it or fix the name.`;
  }
  if (new Set(modules).size !== modules.length) {
    return 'GAME.json engine.modules has a duplicate entry — list each module once.';
  }
  const expectedOrder = GAME_KIT_MODULES.filter((m) => modules.includes(m));
  if (modules.join(',') !== expectedOrder.join(',')) {
    return (
      `GAME.json engine.modules is out of order — the gate's assembler requires the canonical GAME_KIT_MODULES ` +
      `order (games-repo-contract.ts), or it throws before typecheck even runs. Reorder to: ` +
      `${JSON.stringify(expectedOrder)}.`
    );
  }

  if (modules.includes('audio')) {
    const audio = manifest.audio;
    const audioObj =
      typeof audio === 'object' && audio !== null && !Array.isArray(audio) ? (audio as Record<string, unknown>) : {};
    const sounds = audioObj.sounds;
    const music = audioObj.music;
    if (!Array.isArray(sounds) || sounds.length === 0) {
      return (
        'GAME.json enables the "audio" engine module but has no audio.sounds array. assemble will throw ' +
        '"<slug> enables audio but does not select audio.sounds" — add audio.sounds (from the shared catalog, ' +
        'or your own music.json for custom tracks) or drop "audio" from engine.modules if the game is silent.'
      );
    }
    if (typeof music !== 'string' || !music) {
      return (
        'GAME.json enables the "audio" engine module but has no audio.music string. assemble will throw ' +
        '"<slug> enables audio but does not select audio.music" — add audio.music, or drop "audio" from ' +
        'engine.modules if the game is silent.'
      );
    }
  }

  return null;
}
