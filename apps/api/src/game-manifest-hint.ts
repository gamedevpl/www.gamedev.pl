/**
 * Soft, best-effort shape check for a staged `GAME.json` — catches the crash classes the
 * shared kit's assemble step throws on *before* build/typecheck even starts, so the agent
 * hears about them at stage time instead of ~2-3 minutes later off a Cloud Build report
 * (or, if the delivering session already ended, only via the next reconnect).
 *
 * Deliberately shallow: this repo does not carry the games repo's module catalog, so it
 * cannot validate module names, canonical order, or duplicates (that is `validate.ts` in
 * www.gamedev.pl-games, which still runs as the source of truth in the gate). It only
 * catches the two shapes that crash `readSharedSources` outright — `engine.modules`
 * missing/empty, and `audio` selected without `audio.sounds` / `audio.music` — because
 * those are silent `undefined` reads, not a validation error, so nothing points at the
 * real cause until a human reads a smoke-test stack trace (arena-brawlers, 2026-08-09:
 * two straight preview deliveries died on `Cannot read properties of undefined (reading
 * 'modules')` because GAME.json never had an `engine` block, and the agent that fixed an
 * unrelated typecheck error in game.ts never looked at GAME.json again).
 */
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
