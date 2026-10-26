// Check draft imports against the same limits as published games.
import { build, type Message } from 'esbuild';
import { gameTypeScriptEntry } from '@gamedevpl/contract';
import type { SeedFile } from './game-seed.js';
import { resolveGameTypeScriptPath } from '../platform/game-module-path.js';
import { MAX_SOURCE_GRAPH_MODULES, SOURCE_GRAPH_BUDGET_BYTES } from '../platform/games-repo-contract.js';

/** Same ceilings as the play-path bundler, so agreement between the two is by value. */
const MAX_GAME_MODULES = MAX_SOURCE_GRAPH_MODULES;
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

  let generated: ReturnType<typeof gameTypeScriptEntry>;
  try {
    generated = gameTypeScriptEntry(entry, sources.get(`${gameRoot}/GAME.json`));
  } catch (error) {
    return { ok: false, errors: [String(error)] };
  }
  const loadedPaths = new Set([`${gameRoot}/${generated.entryFile}`]);
  let sourceBytes = Buffer.byteLength(generated.source, 'utf8');
  if (sourceBytes > MAX_GAME_SOURCE_BYTES) {
    return { ok: false, errors: [`game TypeScript exceeds ${MAX_GAME_SOURCE_BYTES} bytes`] };
  }

  try {
    await build({
      stdin: {
        contents: generated.source,
        loader: 'ts',
        resolveDir: gameRoot,
        sourcefile: `${gameRoot}/${generated.entryFile}`,
      },
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
                return { errors: [{ text: `game imports must be TypeScript or JSON files inside games/${slug}` }] };
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
              return {
                contents: source,
                loader: loadedPath.endsWith('.json') ? 'json' : 'ts',
                resolveDir: loadedPath.slice(0, loadedPath.lastIndexOf('/')),
              };
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
