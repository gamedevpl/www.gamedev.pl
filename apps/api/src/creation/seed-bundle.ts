// Answers one question about a generated draft: does its TypeScript bundle?
//
// The seed's draft has never been run, and "does it compile" decides two different
// things downstream. For the agent it barely matters — a one-line type error is exactly
// the kind of thing it fixes in its first minute. For the *creator* it decides
// everything: a draft that bundles can be assembled into a playable round-0 preview on
// the status page, and one that does not cannot. So the seeder checks here, in-process,
// and buys one cheap repair round from the model when the answer is no.
//
// The check mirrors the play path's bundler (`bundleGameTypeScript` in
// `github-client.ts`) deliberately: same esbuild settings, same relative-imports-only
// rule, same module and byte ceilings — so "this seed bundles" here means the serve path
// will agree later, instead of the two quietly diverging. It reads from the in-memory
// draft rather than a ref because at check time the files exist nowhere else; esbuild
// transpiles without typechecking, which is also exactly the bar a preview needs (a type
// error does not stop a game from playing; a syntax error or missing module does).

import { build, type Message } from 'esbuild';
import type { SeedFile } from './game-seed.js';
import { resolveGameTypeScriptPath } from '../catalog/github-client.js';
import { SOURCE_GRAPH_BUDGET_BYTES } from '../catalog/games-repo-contract.js';

/** Same ceilings as the play-path bundler, so agreement between the two is by value. */
const MAX_GAME_MODULES = 64;
const MAX_GAME_SOURCE_BYTES = SOURCE_GRAPH_BUDGET_BYTES;

export type SeedBundleResult = { ok: true } | { ok: false; errors: string[] };

/** One esbuild message as a line the repair prompt can quote back to the model. */
function formatMessage(message: Message): string {
  const where = message.location ? `${message.location.file}:${message.location.line}: ` : '';
  return `${where}${message.text}`;
}

/**
 * Bundles a draft's entry point against its own files, and nothing else.
 *
 * Games import only their own modules — GameKit is provided by the assembler, not
 * imported — so a draft is checkable in isolation, before any branch exists. Failure
 * comes back as messages precise enough for a model to act on (file, line, text).
 */
export async function checkSeedBundles(slug: string, files: SeedFile[]): Promise<SeedBundleResult> {
  const gameRoot = `/games/${slug}`;
  const sources = new Map(files.map((file) => [`${gameRoot}/${file.path}`, file.content]));
  const entry = sources.get(`${gameRoot}/game.ts`);
  if (!entry) return { ok: false, errors: ['game.ts is missing'] };

  const loadedPaths = new Set([`${gameRoot}/game.ts`]);
  let sourceBytes = Buffer.byteLength(entry, 'utf8');
  if (sourceBytes > MAX_GAME_SOURCE_BYTES) {
    return { ok: false, errors: [`game TypeScript exceeds ${MAX_GAME_SOURCE_BYTES} bytes`] };
  }

  try {
    await build({
      stdin: { contents: entry, loader: 'ts', resolveDir: gameRoot, sourcefile: `${gameRoot}/game.ts` },
      bundle: true,
      write: false,
      platform: 'browser',
      target: 'es2022',
      format: 'iife',
      logLevel: 'silent',
      plugins: [
        {
          name: 'seed-draft-modules',
          setup(builder) {
            builder.onResolve({ filter: /^\./ }, (args) => {
              const sourcePath = resolveGameTypeScriptPath(args.resolveDir, args.path);
              if (!sourcePath || !sourcePath.startsWith(`${gameRoot}/`)) {
                return { errors: [{ text: `game imports must be TypeScript files inside games/${slug}` }] };
              }
              return { path: sourcePath, namespace: 'seed-draft' };
            });
            builder.onResolve({ filter: /^[^.]/ }, (args) => ({
              errors: [{ text: `game runtime dependency is forbidden: "${args.path}"` }],
            }));
            builder.onLoad({ filter: /.*/, namespace: 'seed-draft' }, (args) => {
              // Directory imports fall back to index.ts, matching the play path.
              let loadedPath = args.path;
              let source = sources.get(loadedPath);
              if (source === undefined && loadedPath.endsWith('.ts')) {
                const indexPath = `${loadedPath.slice(0, -'.ts'.length)}/index.ts`;
                const indexSource = sources.get(indexPath);
                if (indexSource !== undefined) {
                  loadedPath = indexPath;
                  source = indexSource;
                }
              }
              if (source === undefined) {
                return {
                  errors: [
                    {
                      text: `game module not found: ${args.path.slice(gameRoot.length + 1)} — the draft never wrote it`,
                    },
                  ],
                };
              }
              if (!loadedPaths.has(loadedPath)) {
                if (loadedPaths.size >= MAX_GAME_MODULES) {
                  return { errors: [{ text: `game exceeds ${MAX_GAME_MODULES} TypeScript modules` }] };
                }
                loadedPaths.add(loadedPath);
                sourceBytes += Buffer.byteLength(source, 'utf8');
                if (sourceBytes > MAX_GAME_SOURCE_BYTES) {
                  return { errors: [{ text: `game TypeScript exceeds ${MAX_GAME_SOURCE_BYTES} bytes` }] };
                }
              }
              return { contents: source, loader: 'ts', resolveDir: loadedPath.slice(0, loadedPath.lastIndexOf('/')) };
            });
          },
        },
      ],
    });
    return { ok: true };
  } catch (error) {
    const messages = (error as { errors?: Message[] }).errors;
    if (Array.isArray(messages) && messages.length > 0) {
      // A handful is plenty for one repair round; fifty repeats of the same root cause
      // just spend prompt tokens saying it louder.
      return { ok: false, errors: messages.slice(0, 8).map(formatMessage) };
    }
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
