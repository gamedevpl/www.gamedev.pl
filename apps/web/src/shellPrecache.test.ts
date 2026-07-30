import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildManifestLine,
  CACHE_PREFIX,
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
