import { build, transform } from 'esbuild';
import { SIM_GLOBAL_NAME, type SimSource } from '@gamedevpl/zone-core';

/**
 * Where the host gets a game's simulation.
 *
 * It bundles `games/<slug>/sim.ts` out of the games repo at the published ref, together
 * with `shared/sim-math.ts` from that same ref. Both from one ref on purpose: the shim
 * and the sim have to be the pair CI proved, and reading them from different commits is
 * the one way to get a portable-`Math` bug back after it was fixed.
 *
 * **Server-runnability stays derived.** The host does not read a manifest field that
 * claims a game can run here; it fetches the same `sim.ts` the client predicts with,
 * bundles it the same way the CI harness does, and finds out by running it. That is the
 * touch-support precedent applied to netcode, and it is why this file has no allow-list
 * of games in it.
 *
 * The module graph is checked rather than trusted, and the check falls out of the
 * resolver rather than being a separate pass: nothing outside `games/<slug>/` resolves at
 * all. A sim that imported its own render code would drag a canvas into a realm that has
 * no DOM, and would fail on load rather than three ticks into somebody's evening.
 */

/** Modules and bytes one sim may pull in, mirroring the API's limits for a game bundle. */
const MAX_SIM_MODULES = 24;
const MAX_SIM_SOURCE_BYTES = 512 * 1024;

/** How long a bundled sim is reused before it is read again. A sim changes on a merge. */
const DEFAULT_TTL_MS = 10 * 60_000;

export interface GamesRepoFiles {
  /** Reads a repo-relative path at a ref, or null when it does not exist. */
  readText(path: string, ref: string): Promise<string | null>;
}

export interface GithubSimSourceOptions {
  files: GamesRepoFiles;
  ref?: string;
  ttlMs?: number;
  now?: () => number;
}

type Loaded = { bundleJs: string; simMathJs: string } | null;

export function createGithubSimSource(options: GithubSimSourceOptions): SimSource {
  const ref = options.ref ?? process.env.GAMES_PUBLISHED_REF ?? 'main';
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  const cache = new Map<string, { expiresAt: number; value: Loaded }>();
  const inFlight = new Map<string, Promise<Loaded>>();
  let simMath: { expiresAt: number; js: string } | null = null;

  async function loadSimMath(): Promise<string> {
    if (simMath && simMath.expiresAt > now()) return simMath.js;
    const source = await options.files.readText('shared/sim-math.ts', ref);
    if (source === null) {
      throw new Error(
        'shared/sim-math.ts is missing from the games repo. Without it a sim would get the ' +
          "host engine's Math, whose sin/cos/pow differ from a browser's in the last bit — " +
          'which is a desync on the first rotation rather than a visible failure.',
      );
    }
    const { code } = await transform(source, { loader: 'ts', target: 'es2022', format: 'iife' });
    simMath = { js: code, expiresAt: now() + ttlMs };
    return code;
  }

  async function loadSim(slug: string): Promise<Loaded> {
    const gameRoot = `games/${slug}`;
    const entry = await options.files.readText(`${gameRoot}/sim.ts`, ref);
    // No sim is the ordinary answer for almost every game, and not an error.
    if (entry === null) return null;

    const loadedPaths = new Set([`${gameRoot}/sim.ts`]);
    let sourceBytes = Buffer.byteLength(entry, 'utf8');

    const result = await build({
      stdin: { contents: entry, loader: 'ts', resolveDir: `/${gameRoot}`, sourcefile: `${gameRoot}/sim.ts` },
      bundle: true,
      write: false,
      platform: 'neutral',
      target: 'es2022',
      format: 'iife',
      globalName: SIM_GLOBAL_NAME,
      legalComments: 'none',
      plugins: [
        {
          name: 'games-repo-sim',
          setup(builder) {
            builder.onResolve({ filter: /^\./ }, (args) => {
              const resolved = resolveSimPath(args.resolveDir, args.path);
              if (!resolved || !resolved.startsWith(`/${gameRoot}/`)) {
                return { errors: [{ text: `${gameRoot}/sim.ts may only import from inside ${gameRoot}` }] };
              }
              return { path: resolved, namespace: 'games-repo-sim' };
            });
            // A sim has no dependencies. Not "should not" — cannot: the realm has no
            // module loader, so a bare specifier could never have resolved at runtime.
            builder.onResolve({ filter: /^[^.]/ }, (args) => ({
              errors: [{ text: `a sim may not depend on "${args.path}"; the realm has no modules to load` }],
            }));
            builder.onLoad({ filter: /.*/, namespace: 'games-repo-sim' }, async (args) => {
              const source = await options.files.readText(args.path.slice(1), ref);
              if (source === null) return { errors: [{ text: `sim module not found: ${args.path.slice(1)}` }] };
              if (!loadedPaths.has(args.path)) {
                if (loadedPaths.size >= MAX_SIM_MODULES) {
                  return { errors: [{ text: `a sim may not span more than ${MAX_SIM_MODULES} modules` }] };
                }
                loadedPaths.add(args.path);
                sourceBytes += Buffer.byteLength(source, 'utf8');
                if (sourceBytes > MAX_SIM_SOURCE_BYTES) {
                  return { errors: [{ text: `sim source exceeds ${MAX_SIM_SOURCE_BYTES} bytes` }] };
                }
              }
              return { contents: source, loader: 'ts', resolveDir: posixDirname(args.path) };
            });
          },
        },
      ],
    });

    const output = result.outputFiles?.[0];
    if (!output) throw new Error(`esbuild produced no output for ${gameRoot}/sim.ts`);
    return { bundleJs: output.text, simMathJs: await loadSimMath() };
  }

  return {
    async load(slug) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;

      const cached = cache.get(slug);
      if (cached && cached.expiresAt > now()) return cached.value;

      let pending = inFlight.get(slug);
      if (!pending) {
        // One read per slug is shared, so a burst of arrivals into a waking zone cannot
        // stampede the games repo — which is behind a shared token budget that a
        // per-join fetch would burn through.
        pending = loadSim(slug)
          .then((value) => {
            cache.set(slug, { value, expiresAt: now() + ttlMs });
            return value;
          })
          .finally(() => {
            inFlight.delete(slug);
          });
        inFlight.set(slug, pending);
      }
      return pending;
    },
  };
}

/**
 * Maps a relative import onto a repo path.
 *
 * Games-repo TypeScript follows ordinary ESM habits: a relative import may carry `.ts`,
 * carry `.js` (TypeScript's Node ESM convention, where the source file is still `.ts`),
 * or carry nothing at all. All three land on the same file, and anything that climbs out
 * of the game directory is caught by the caller.
 */
function resolveSimPath(resolveDir: string, specifier: string): string | null {
  const segments = `${resolveDir}/${specifier}`.split('/');
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  let joined = `/${stack.join('/')}`;
  if (joined.endsWith('.js')) joined = `${joined.slice(0, -'.js'.length)}.ts`;
  else if (!joined.endsWith('.ts')) joined = `${joined}.ts`;
  return joined;
}

function posixDirname(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index <= 0 ? '/' : filePath.slice(0, index);
}

/** Reads games-repo files over GitHub's contents API, with the host's own token. */
export function createGithubFiles(repo: string, token: string, fetchImpl: typeof fetch = fetch): GamesRepoFiles {
  return {
    async readText(path, ref) {
      const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
      const response = await fetchImpl(url, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github.raw',
          'user-agent': 'gamedev-world',
        },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`games repo read failed for ${path}: ${response.status}`);
      return response.text();
    },
  };
}
