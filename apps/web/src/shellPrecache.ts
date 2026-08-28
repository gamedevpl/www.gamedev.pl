/**
 * The build-time half of the installed app's shell cache (mobile-app-plan.md M1 (private www.gamedev.pl-ops repo)).
 *
 * `public/sw.js` ships with a placeholder build manifest so it stays plain, runnable
 * JavaScript in dev, where there is no hashed bundle to precache and caching Vite's
 * live modules would defeat HMR. At the end of a production build the Vite plugin in
 * `vite.config.ts` replaces that one line in `dist/sw.js` with the real asset list.
 *
 * Rewriting the worker itself — rather than having it `importScripts()` a generated
 * manifest — is deliberate. A browser decides a worker has been updated by byte-comparing
 * the script it fetches, and only some browsers include imported scripts in that
 * comparison. A worker whose own bytes never change is a worker that can pin a returning
 * visitor to a shell from months ago, which is exactly the failure this cache must not
 * have. Embedding the manifest makes every deploy a byte-different worker on every
 * browser, so the update check cannot miss it.
 */

/** Everything in one revision's cache lives under this prefix; `activate` sweeps the rest. */
export const CACHE_PREFIX = 'gamedevpl-shell-';

/**
 * Shell files that are not part of Vite's bundle graph and so have to be named here.
 *
 * `/index.html` is the shell every navigation is answered with. `/offline.html` is the
 * last resort for a navigation that predates the precache. The manifest and the 192px
 * icon are what an installed app needs on hand to render its own identity — including
 * on the offline page, which references the icon and must not show a broken image at
 * the exact moment the network is gone.
 */
export const SHELL_EXTRAS = ['/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'] as const;

/** Bundle outputs worth precaching: the app's own code and the fonts its first paint needs. */
const PRECACHEABLE_ASSET = /\.(?:js|css|woff2)$/;

export interface ShellManifest {
  /** Changes whenever any precached byte changes; names the cache for this build. */
  revision: string;
  /** Absolute, same-origin paths, sorted so the manifest is reproducible. */
  shell: string[];
  /** This build's own deliberately-unprecached assets — see `deferredAssetEntries`. */
  deferred: string[];
}

/**
 * Which of a build's emitted files belong in the shell cache.
 *
 * `.woff` is deliberately excluded even though the build emits it beside every `.woff2`:
 * it exists only for browsers too old for woff2, and every browser old enough to need it
 * is far too old to have a service worker. Precaching both formats would double the font
 * payload of an install for a set of browsers that will never read either copy.
 *
 * Source maps are excluded for the same reason in reverse — nothing renders without them.
 *
 * `isDeferred` excludes anything the shell does not need before the user acts: a route's
 * own `lazy(() => import(...))` chunk, or something reachable only through one (see
 * `reachableFromShell`). Precaching it anyway defeats the reason it is deferred at all.
 * Defaults to "nothing is deferred" so a caller that never lazy-loads anything is unaffected.
 */
export function shellAssetEntries(
  emittedFileNames: Iterable<string>,
  isDeferred: (fileName: string) => boolean = () => false,
): string[] {
  const entries = new Set<string>(SHELL_EXTRAS);

  for (const fileName of emittedFileNames) {
    if (PRECACHEABLE_ASSET.test(fileName) && !isDeferred(fileName)) {
      entries.add(`/${fileName.replace(/^\/+/, '')}`);
    }
  }

  return [...entries].sort();
}

/**
 * The complement of `shellAssetEntries`: this build's own assets that are deliberately
 * left out of the shell cache — a route's lazy chunk, or a worker bundle it alone
 * references.
 *
 * `public/sw.js` needs this list too, and not just for symmetry: without it, a fetch
 * failure for one of these reads identically to a genuinely stale hash left by a client
 * open across a deploy, and the worker "heals" by deleting the whole shell cache and
 * force-navigating every open tab — a disproportionate reaction to one route's chunk
 * having an ordinary network hiccup. Naming the current build's own deferred assets is
 * what lets the worker tell "this is fine, just fetch it" from "this shell has rotted".
 */
export function deferredAssetEntries(
  emittedFileNames: Iterable<string>,
  isDeferred: (fileName: string) => boolean,
): string[] {
  const entries = new Set<string>();

  for (const fileName of emittedFileNames) {
    if (PRECACHEABLE_ASSET.test(fileName) && isDeferred(fileName)) {
      entries.add(`/${fileName.replace(/^\/+/, '')}`);
    }
  }

  return [...entries].sort();
}

/** A build output's shape, reduced to just what `reachableFromShell` needs to see. */
export interface BundleFile {
  /** A Rollup chunk (JS with real import metadata) vs. everything else (CSS, fonts,
   *  images, and — critically — a `new Worker(new URL(...))` build, which Rollup emits
   *  as a plain asset with none of a chunk's metadata at all). */
  kind: 'chunk' | 'asset';
  /** Chunk source or textual asset content; omitted for binary assets (images, fonts). */
  text?: string;
  /** True for the page's own static `<script type="module">` entry chunk. */
  isEntry?: boolean;
  /** True for a chunk that exists only as the target of a `lazy(() => import(...))`. */
  isDynamicEntry?: boolean;
  /** Filenames this chunk statically imports — Rollup's `imports`, never `dynamicImports`. */
  imports?: readonly string[];
}

/**
 * Which of a build's files the shell can never avoid loading.
 *
 * Chunk-to-chunk reachability follows Rollup's own `imports` graph, deliberately never a
 * chunk's *text* — a chunk's compiled code also names every chunk it dynamically
 * `import()`s (Vite inlines a `__vite__mapDeps` prefetch array right at the call site),
 * so text-matching cannot tell "loads it now" from "knows where to fetch it later".
 * `imports` can, because Rollup already keeps `dynamicImports` in a separate list.
 *
 * Assets carry no graph metadata at all — `CodeSurface.tsx`'s `new Worker(new URL(...))`
 * build comes out of Rollup as a plain asset, indistinguishable by type from a stylesheet
 * or a font. The only way to find one is whether something already known reachable names
 * it in its own text, so this walks the *reachable* set's text (index.html, the chunks
 * `imports` found, and each asset found this way in turn — a stylesheet's `@font-face`
 * `url()`s fall out of that last step) to grow the asset side, without ever consulting an
 * excluded chunk's text — which is what would let AdminConsole's own prefetch array pull
 * it back in.
 */
export function reachableFromShell(files: Record<string, BundleFile>, indexHtml: string): Set<string> {
  const shortNameOf = (fileName: string) => fileName.split('/').pop() ?? fileName;

  const reachable = new Set<string>();
  const chunkQueue = Object.keys(files).filter(
    (fileName) => files[fileName]?.isEntry && !files[fileName]?.isDynamicEntry,
  );
  while (chunkQueue.length > 0) {
    const fileName = chunkQueue.pop();
    if (fileName === undefined || reachable.has(fileName)) continue;
    reachable.add(fileName);
    for (const imported of files[fileName]?.imports ?? []) {
      if (!reachable.has(imported)) chunkQueue.push(imported);
    }
  }

  const textPool = new Map<string, string>([['', indexHtml]]);
  for (const fileName of reachable) {
    const text = files[fileName]?.text;
    if (text !== undefined) textPool.set(fileName, text);
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const fileName of Object.keys(files)) {
      if (files[fileName]?.kind !== 'asset' || reachable.has(fileName)) continue;
      const shortName = shortNameOf(fileName);
      for (const text of textPool.values()) {
        if (!text.includes(shortName)) continue;
        reachable.add(fileName);
        const ownText = files[fileName]?.text;
        if (ownText !== undefined) textPool.set(fileName, ownText);
        grew = true;
        break;
      }
    }
  }

  return reachable;
}

/**
 * A revision id for a set of precached files.
 *
 * Hashing the *contents* rather than the file names is what keeps the unhashed members
 * of the shell honest: `/offline.html` and `/manifest.webmanifest` carry no content hash
 * in their URL, so a build that changed only those would otherwise reuse the previous
 * revision and leave the old copies cached forever.
 *
 * Truncated to 16 hex characters: this only has to distinguish consecutive deploys of one
 * site, and it ends up in a cache name a human may well read in devtools.
 */
export function shellRevision(contents: Iterable<string | Uint8Array>, hash: (input: Uint8Array) => string): string {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();

  for (const content of contents) {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    // Length-prefixed so two different splits of the same bytes cannot collide.
    chunks.push(encoder.encode(`${bytes.byteLength}:`), bytes);
  }

  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return hash(joined).slice(0, 16);
}

/**
 * The single line `public/sw.js` reserves for the generated manifest. Matched exactly —
 * see `replaceBuildManifest` for why an unmatched marker has to be a build failure.
 */
const BUILD_MANIFEST_MARKER = /^const BUILD = .*; \/\/ __BUILD_MANIFEST__$/m;

export function buildManifestLine(manifest: ShellManifest): string {
  return `const BUILD = ${JSON.stringify(manifest)}; // __BUILD_MANIFEST__`;
}

/**
 * Put the real manifest into the worker source.
 *
 * Throws rather than returning the source untouched when the marker is gone. A silent
 * no-op here would ship a worker that precaches nothing and caches no navigation — the
 * app would still work, tests would still pass, and the only symptom would be that the
 * installed app quietly stopped opening offline. That is precisely the class of failure
 * that survives to production, so it is spelled as a build break instead.
 */
export function replaceBuildManifest(source: string, manifest: ShellManifest): string {
  if (!BUILD_MANIFEST_MARKER.test(source)) {
    throw new Error('sw.js is missing its `// __BUILD_MANIFEST__` line; the shell precache manifest has nowhere to go');
  }
  return source.replace(BUILD_MANIFEST_MARKER, buildManifestLine(manifest));
}
