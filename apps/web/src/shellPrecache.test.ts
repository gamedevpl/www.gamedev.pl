import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildManifestLine,
  CACHE_PREFIX,
  reachableFromShell,
  replaceBuildManifest,
  SHELL_EXTRAS,
  shellAssetEntries,
  shellRevision,
} from './shellPrecache.js';

const sha256 = (input: Uint8Array) => createHash('sha256').update(input).digest('hex');

const SW_SOURCE = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js'),
  'utf8',
);

describe('shellAssetEntries', () => {
  it('precaches the app bundle, its stylesheet and its woff2 fonts', () => {
    const entries = shellAssetEntries(['assets/index-abc.js', 'assets/index-def.css', 'assets/Font-ghi.woff2']);

    expect(entries).toContain('/assets/index-abc.js');
    expect(entries).toContain('/assets/index-def.css');
    expect(entries).toContain('/assets/Font-ghi.woff2');
  });

  it('leaves out the .woff fallback the build emits beside every .woff2', () => {
    const entries = shellAssetEntries(['assets/Font-ghi.woff2', 'assets/Font-jkl.woff']);

    expect(entries).toContain('/assets/Font-ghi.woff2');
    // Doubling an install's font payload for browsers too old to have a service
    // worker at all would be paying twice to serve nobody.
    expect(entries).not.toContain('/assets/Font-jkl.woff');
  });

  it('leaves out source maps and anything else that is not needed to render', () => {
    const entries = shellAssetEntries(['assets/index-abc.js', 'assets/index-abc.js.map', 'assets/hero-xyz.png']);

    expect(entries).not.toContain('/assets/index-abc.js.map');
    expect(entries).not.toContain('/assets/hero-xyz.png');
  });

  it('always includes the shell, the offline page, the manifest and the icon', () => {
    const entries = shellAssetEntries([]);
    expect(entries).toEqual([...SHELL_EXTRAS].sort());
  });

  it('returns a sorted, de-duplicated list so the manifest is reproducible', () => {
    const entries = shellAssetEntries(['assets/b.js', 'assets/a.css', '/index.html']);

    expect(entries).toEqual([...entries].sort());
    expect(new Set(entries).size).toBe(entries.length);
  });

  it('leaves out a route chunk reached only through lazy(() => import(...))', () => {
    // Precaching it would download AdminConsole/CreatorStudioView/CodeMirrorEditor
    // for every visitor in the background, regardless of whether they ever navigate
    // there — the exact download this chunk being lazy exists to avoid.
    const entries = shellAssetEntries(
      ['assets/index-abc.js', 'assets/AdminConsole-def.js'],
      (fileName) => fileName === 'assets/AdminConsole-def.js',
    );

    expect(entries).toContain('/assets/index-abc.js');
    expect(entries).not.toContain('/assets/AdminConsole-def.js');
  });

  it('precaches everything when no deferred predicate is given', () => {
    const entries = shellAssetEntries(['assets/index-abc.js']);
    expect(entries).toContain('/assets/index-abc.js');
  });
});

describe('reachableFromShell', () => {
  it('follows a static entry chunk into what it imports, and stops at what it does not', () => {
    // index imports shared.js; AdminConsole is a lazy chunk index never statically imports.
    const reachable = reachableFromShell(
      {
        'assets/index-abc.js': { kind: 'chunk', text: '', isEntry: true, imports: ['assets/shared-def.js'] },
        'assets/shared-def.js': { kind: 'chunk', text: 'export const x = 1' },
        'assets/AdminConsole-ghi.js': { kind: 'chunk', text: 'export const AdminConsole = 1', isDynamicEntry: true },
      },
      '<script type="module" src="/assets/index-abc.js"></script>',
    );

    expect(reachable.has('assets/index-abc.js')).toBe(true);
    expect(reachable.has('assets/shared-def.js')).toBe(true);
    expect(reachable.has('assets/AdminConsole-ghi.js')).toBe(false);
  });

  it('does not follow a lazy chunk’s filename into a chunk that only prefetches it', () => {
    // The bug this guards against: Vite inlines a __vite__mapDeps prefetch array right at
    // a lazy(() => import(...)) call site, so the entry chunk's own *text* names every
    // lazy chunk it can ever trigger — that is not the same as needing it up front. Only
    // `imports` (never a chunk's text) may decide chunk-to-chunk reachability.
    const reachable = reachableFromShell(
      {
        'assets/index-abc.js': {
          kind: 'chunk',
          text: 'const __vite__mapDeps=(i)=>["assets/AdminConsole-ghi.js"][i]',
          isEntry: true,
          imports: [],
        },
        'assets/AdminConsole-ghi.js': { kind: 'chunk', text: 'export const AdminConsole = 1', isDynamicEntry: true },
      },
      '<script type="module" src="/assets/index-abc.js"></script>',
    );

    expect(reachable.has('assets/AdminConsole-ghi.js')).toBe(false);
  });

  it('reaches a worker bundle only through the chunk that constructs it', () => {
    // Vite emits a `new Worker(new URL(...))` build as a plain asset — no isEntry, no
    // imports, nothing but text that names it from inside the chunk that builds it.
    const reachableViaStaticChunk = reachableFromShell(
      {
        'assets/index-abc.js': {
          kind: 'chunk',
          text: 'new Worker(new URL("assets/tsWorker-xyz.js"))',
          isEntry: true,
        },
        'assets/tsWorker-xyz.js': { kind: 'asset', text: 'importScripts("assets/lib.dom.d-uvw.js")' },
        'assets/lib.dom.d-uvw.js': { kind: 'asset', text: '// lib' },
      },
      '<script src="/assets/index-abc.js"></script>',
    );
    expect(reachableViaStaticChunk.has('assets/tsWorker-xyz.js')).toBe(true);
    expect(reachableViaStaticChunk.has('assets/lib.dom.d-uvw.js')).toBe(true);

    // Same worker, but only CreatorStudioView (a lazy chunk) builds it — neither the
    // worker nor the TypeScript lib files it references should count as reachable.
    const reachableViaLazyChunk = reachableFromShell(
      {
        'assets/index-abc.js': { kind: 'chunk', text: 'no worker mentioned here', isEntry: true },
        'assets/CreatorStudioView-def.js': {
          kind: 'chunk',
          text: 'new Worker(new URL("assets/tsWorker-xyz.js"))',
          isDynamicEntry: true,
        },
        'assets/tsWorker-xyz.js': { kind: 'asset', text: 'importScripts("assets/lib.dom.d-uvw.js")' },
        'assets/lib.dom.d-uvw.js': { kind: 'asset', text: '// lib' },
      },
      '<script src="/assets/index-abc.js"></script>',
    );
    expect(reachableViaLazyChunk.has('assets/tsWorker-xyz.js')).toBe(false);
    expect(reachableViaLazyChunk.has('assets/lib.dom.d-uvw.js')).toBe(false);
  });

  it('reaches a stylesheet and its fonts through index.html, not the entry chunk', () => {
    // A stylesheet is <link>ed from index.html, never imported from JS; its fonts are
    // named only inside its own CSS text, via @font-face url().
    const reachable = reachableFromShell(
      {
        'assets/index-abc.js': { kind: 'chunk', text: 'no css mentioned here', isEntry: true },
        'assets/index-def.css': { kind: 'asset', text: "@font-face{src:url('assets/Font-ghi.woff2')}" },
        'assets/Font-ghi.woff2': { kind: 'asset' },
      },
      '<link rel="stylesheet" href="/assets/index-def.css">',
    );

    expect(reachable.has('assets/index-def.css')).toBe(true);
    expect(reachable.has('assets/Font-ghi.woff2')).toBe(true);
  });

  it('leaves a binary asset from propagating further, but still counts it reachable', () => {
    const reachable = reachableFromShell(
      { 'assets/icon-abc.png': { kind: 'asset' } },
      '<link rel="icon" href="/assets/icon-abc.png">',
    );
    expect(reachable.has('assets/icon-abc.png')).toBe(true);
  });
});

describe('shellRevision', () => {
  it('changes when any precached byte changes', () => {
    const before = shellRevision(['<html>one</html>', 'body{}'], sha256);
    const after = shellRevision(['<html>two</html>', 'body{}'], sha256);

    expect(after).not.toBe(before);
  });

  it('changes when only an unhashed file like offline.html changes', () => {
    // The whole reason contents are hashed rather than file names: /offline.html and
    // /manifest.webmanifest carry no content hash in their URL, so a name-based
    // revision would leave a changed offline page cached forever.
    const before = shellRevision(['/assets/index-abc.js contents', 'offline v1'], sha256);
    const after = shellRevision(['/assets/index-abc.js contents', 'offline v2'], sha256);

    expect(after).not.toBe(before);
  });

  it('is stable for identical input', () => {
    expect(shellRevision(['a', 'b'], sha256)).toBe(shellRevision(['a', 'b'], sha256));
  });

  it('does not collide when the same bytes are split differently', () => {
    expect(shellRevision(['ab', 'c'], sha256)).not.toBe(shellRevision(['a', 'bc'], sha256));
  });

  it('is short enough to read in a cache name', () => {
    expect(shellRevision(['a'], sha256)).toHaveLength(16);
  });
});

describe('replaceBuildManifest', () => {
  const manifest = { revision: 'cafef00d', shell: ['/index.html', '/assets/index-abc.js'] };

  it('replaces the placeholder with the real manifest', () => {
    const result = replaceBuildManifest(
      "const BUILD = { revision: 'dev', shell: [] }; // __BUILD_MANIFEST__",
      manifest,
    );

    expect(result).toBe(buildManifestLine(manifest));
    expect(result).toContain('"revision":"cafef00d"');
    expect(result).toContain('/assets/index-abc.js');
  });

  it('keeps the rest of the worker untouched', () => {
    const source = `// header\nconst BUILD = { revision: 'dev', shell: [] }; // __BUILD_MANIFEST__\nself.addEventListener('push', () => {});\n`;

    const result = replaceBuildManifest(source, manifest);

    expect(result.startsWith('// header\n')).toBe(true);
    expect(result).toContain("self.addEventListener('push', () => {});");
  });

  it('throws rather than silently shipping a worker that precaches nothing', () => {
    // A no-op here would produce an app that still works, still passes tests, and
    // quietly stops opening offline — so it has to break the build instead.
    expect(() => replaceBuildManifest('const BUILD = {};\n', manifest)).toThrow(/__BUILD_MANIFEST__/);
  });
});

describe('the worker source this module rewrites', () => {
  it('carries the placeholder line the build replaces', () => {
    expect(() => replaceBuildManifest(SW_SOURCE, { revision: 'x', shell: [] })).not.toThrow();
  });

  it('names its caches with the prefix declared here', () => {
    // sw.js is plain JavaScript served straight from public/ and cannot import this
    // module, so the two copies of the prefix are tied together by this assertion.
    expect(SW_SOURCE).toContain(`const CACHE_PREFIX = '${CACHE_PREFIX}';`);
  });

  it('never caches the API, whose responses are the catalog, games and media', () => {
    expect(SW_SOURCE).toContain("url.pathname.startsWith('/api/')");
  });

  // Executes the shipped predicate rather than matching its source text: this rule is
  // the difference between a consent screen and a 404, and a substring assertion would
  // pass on a version that never reaches the fetch handler.
  it('lets server-rendered routes reach the origin, so OAuth consent is not a 404', () => {
    const source = SW_SOURCE.match(/function isServerRenderedRoute[\s\S]*?\n}/)?.[0];
    expect(source, 'isServerRenderedRoute must exist in the shipped worker').toBeTruthy();
    const isServerRenderedRoute = new Function('url', `${source}\nreturn isServerRenderedRoute(url);`) as (
      url: URL,
    ) => boolean;

    // CP-2 found every returning creator got the SPA NotFound page here, because the
    // shell answered the navigation and the server never saw it.
    expect(isServerRenderedRoute(new URL('https://www.gamedev.pl/oauth/authorize?client_id=x'))).toBe(true);
    expect(isServerRenderedRoute(new URL('https://www.gamedev.pl/.well-known/oauth-authorization-server'))).toBe(true);

    // Real SPA routes must keep being served from the shell — that is the whole point
    // of the worker, and exempting them would give up offline deep links.
    expect(isServerRenderedRoute(new URL('https://www.gamedev.pl/studio'))).toBe(false);
    expect(isServerRenderedRoute(new URL('https://www.gamedev.pl/play/tv-tycoon'))).toBe(false);
    expect(isServerRenderedRoute(new URL('https://www.gamedev.pl/'))).toBe(false);
    // Not a prefix match on the bare word: /oauthorize is an SPA path, not our route.
    expect(isServerRenderedRoute(new URL('https://www.gamedev.pl/oauthorize'))).toBe(false);
  });

  it('applies the server-route exemption before the navigation branch', () => {
    const handler = SW_SOURCE.slice(SW_SOURCE.indexOf("self.addEventListener('fetch'"));
    const exemption = handler.indexOf('isServerRenderedRoute(url)');
    const navigation = handler.indexOf("request.mode === 'navigate'");
    expect(exemption).toBeGreaterThan(-1);
    // Order is the bug: the navigation branch answers everything it reaches.
    expect(exemption).toBeLessThan(navigation);
  });

  it('stores its navigable documents rebuilt, never straight from cache.add', () => {
    // Found in a browser, not in review: `npx serve` 301s /index.html to /index, so
    // `cache.add` stored a redirected response — and answering a navigation with one
    // throws, which replaces the entire installed app with the browser's error page
    // while an uncontrolled first load still looks perfect. Any host with a clean-URL
    // rule can reintroduce it, so both ends of the fix are pinned here.
    expect(SW_SOURCE).toContain('async function putDocument(cache, url)');
    expect(SW_SOURCE).toContain('new Response(body, { status: 200');
    expect(SW_SOURCE).toContain('!shell.redirected');
  });

  it('refuses to serve a holey shell that would white-screen the installed app', () => {
    // iOS can evict the hashed JS while leaving index.html. Cache-first navigation
    // without this check is a permanent empty #root.
    expect(SW_SOURCE).toContain('async function shellIntact(cacheName)');
    expect(SW_SOURCE).toContain('await caches.delete(CACHE)');
    expect(SW_SOURCE).toContain('client.navigate');
    expect(SW_SOURCE).toContain('legacyAssetOrHeal');
  });

  it('ships inert, so a dev worker caches no live module', () => {
    // The checked-in manifest must stay empty: `hasPrecache` is false for an empty
    // shell, which is what keeps HMR working and stops a dev worker from pinning
    // anyone to a stale module graph.
    const line = SW_SOURCE.split('\n').find((candidate) => candidate.includes('__BUILD_MANIFEST__'));
    expect(line).toContain('shell: []');
  });
});
