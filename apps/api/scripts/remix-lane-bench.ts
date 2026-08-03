/**
 * Shared rig for the code-lane bench: a local games checkout standing in for
 * GitHub, the play path's own document build, and a real `tsc` pass.
 *
 * Everything here is measurement scaffolding. Nothing in `src/` imports it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { assembleGameHtml } from '../src/assemble.js';
import { createLocalGamesClient } from '../src/local-games-repo.js';

export const GAMES_ROOT =
  process.env.GAMES_DIR ??
  path.resolve(fileURLToPath(new URL('../../..', import.meta.url)), '../www.gamedev.pl-games');

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
export function typeCheck(
  slug: string,
  overrides: Record<string, string>,
): { ok: true } | { ok: false; errors: string[] } {
  const gameDir = path.join(GAMES_ROOT, 'games', slug);
  const overlay = new Map<string, string>();
  for (const [relative, source] of Object.entries(overrides)) {
    overlay.set(path.normalize(path.join(gameDir, relative)), source);
  }

  const roots = [path.join(GAMES_ROOT, 'shared/game-kit.d.ts'), ...gameFiles(gameDir, overlay)];
  const options = compilerOptions();

  const host = ts.createCompilerHost(options, true);
  const readFileOriginal = host.readFile.bind(host);
  host.readFile = (name) => overlay.get(path.normalize(name)) ?? readFileOriginal(name);
  const getSourceFileOriginal = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) => {
    const override = overlay.get(path.normalize(name));
    return override === undefined
      ? getSourceFileOriginal(name, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(name, override, languageVersion, true);
  };

  const program = ts.createProgram(roots, options, host);
  const diagnostics = [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()].filter(
    // Only diagnostics inside this game. The shared kit and the repo's other
    // games are not this edit's business and must not fail a candidate.
    (diagnostic) => diagnostic.file && path.normalize(diagnostic.file.fileName).startsWith(gameDir),
  );
  if (diagnostics.length === 0) return { ok: true };

  const checker = program.getTypeChecker();
  return {
    ok: false,
    errors: diagnostics.slice(0, 6).map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      if (!diagnostic.file || diagnostic.start === undefined) return `TS${diagnostic.code}: ${message}`;
      const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const where = `${path.relative(gameDir, diagnostic.file.fileName)}:${line + 1}`;
      return `${where}: error TS${diagnostic.code}: ${message}${available(checker, diagnostic)}`;
    }),
  };
}

/**
 * Name what the model *could* have used.
 *
 * "Property 'flash' does not exist on type 'GameKitGameContext'" tells a repair
 * round that it was wrong but not what is right, and the kit's declaration is
 * 77KB — far too large to put in a prompt that is supposed to cost 3k tokens.
 * The members of the one type it got wrong are a few dozen words, and they are
 * the entire difference between a repair round that can succeed and one that can
 * only guess again.
 */
function available(checker: ts.TypeChecker, diagnostic: ts.Diagnostic): string {
  if (diagnostic.code !== 2339 || !diagnostic.file || diagnostic.start === undefined) return '';
  const node = nodeAt(diagnostic.file, diagnostic.start);
  const access = node?.parent;
  if (!access || !ts.isPropertyAccessExpression(access)) return '';
  const names = checker
    .getTypeAtLocation(access.expression)
    .getProperties()
    .map((symbol) => symbol.getName())
    .filter((name) => !name.startsWith('_'))
    .sort();
  return names.length ? ` (available: ${names.slice(0, 40).join(', ')})` : '';
}

function nodeAt(source: ts.SourceFile, position: number): ts.Node | undefined {
  const find = (node: ts.Node): ts.Node | undefined => {
    if (position < node.getStart(source) || position >= node.getEnd()) return undefined;
    return ts.forEachChild(node, find) ?? node;
  };
  return find(source);
}

/**
 * The games repo's own compiler options, read once.
 *
 * Deliberately NOT via `parseJsonConfigFileContent`: that resolves the config's
 * `include` globs, which walk all 98 games' sources on every call — 25s the
 * first time, for a file list this never uses because the roots are passed
 * explicitly. Reading the options alone makes the same check cost ~1s.
 */
let cachedOptions: ts.CompilerOptions | null = null;
function compilerOptions(): ts.CompilerOptions {
  if (!cachedOptions) {
    const configFile = ts.readConfigFile(path.join(GAMES_ROOT, 'tsconfig.json'), ts.sys.readFile);
    const converted = ts.convertCompilerOptionsFromJson(
      (configFile.config as { compilerOptions?: unknown } | undefined)?.compilerOptions ?? {},
      GAMES_ROOT,
    );
    cachedOptions = { ...converted.options, noEmit: true };
  }
  return cachedOptions;
}

/** Every `.ts` under a game directory, plus any file that exists only in the overlay. */
function gameFiles(gameDir: string, overlay: Map<string, string>): string[] {
  const found = new Set<string>(overlay.keys());
  for (const entry of ts.sys.readDirectory(gameDir, ['.ts'], undefined, undefined)) {
    found.add(path.normalize(entry));
  }
  return [...found];
}
