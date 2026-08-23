/**
 * Shared rig for the code-lane bench: a local games checkout standing in for
 * GitHub, the play path's own document build, and a real `tsc` pass.
 *
 * Everything here is measurement scaffolding. Nothing in `src/` imports it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleGameHtml } from '../src/catalog/assemble.js';
import { createLocalGamesClient } from '../src/catalog/local-games-repo.js';
import { typeCheckGame } from '../src/creation/type-check.js';

export const GAMES_ROOT =
  process.env.GAMES_DIR ?? path.resolve(fileURLToPath(new URL('../../..', import.meta.url)), '../www.gamedev.pl-games');

/** The ref is inert: the local client serves the working tree, not a commit. */
export const REF = 'main';

/**
 * The same local games client the probe uses, so the sweep and the probe cannot
 * disagree about what a game is. It fakes GitHub at the transport seam, which
 * means the real bundler and assembler run unmodified.
 */
export const github = createLocalGamesClient({ rootDir: GAMES_ROOT });

/**
 * The play path's own document build, so "it builds" on the bench means exactly
 * what it means in `remix.ts`: same bundler, same assembler, same caps and CSP.
 */
export async function assembleGame(slug: string, overrides: Record<string, string>): Promise<string | null> {
  const sources = await github.getGameSources(REF, slug, overrides);
  if (!sources) return null;
  return assembleGameHtml(
    {
      title: sources.title ?? slug,
      description: '',
      html: sources.indexHtml,
      js: sources.gameJs,
      css: sources.styleCss,
    },
    { restrictNetwork: true },
  );
}

/**
 * A real `tsc` pass over the game's sources with the candidate edit overlaid.
 *
 * The games repo's own tsconfig and its own `shared/game-kit.d.ts`, so this is
 * the check that repo would apply rather than an approximation of it. Files come
 * from disk except the ones the lane replaced, which come from memory — nothing
 * is written to the working tree.
 *
 * Scoped to one game plus the kit declaration: checking all 98 games per
 * candidate would cost seconds, and an edit confined to one file inside one game
 * cannot affect another.
 */
/**
 * The gate, as production runs it.
 *
 * Deliberately delegates to `src/type-check.ts` rather than shelling out to the
 * games repo's own `tsc`: a bench that measured a *different* checker from the
 * one on the serve path would report a hit rate nobody ever gets. The only thing
 * added here is reading the kit declaration, which the route gets from the
 * GitHub client and this gets from the checkout.
 */
export async function typeCheck(slug: string, sources: Record<string, string>) {
  return typeCheckGame(sources, await gameKit());
}

let cachedKit: string | null | undefined;
/** `shared/game-kit.d.ts` from the checkout — what the game is written against. */
export async function gameKit(): Promise<string | null> {
  if (cachedKit === undefined) cachedKit = await github.getGameKitDeclaration(REF);
  return cachedKit;
}
