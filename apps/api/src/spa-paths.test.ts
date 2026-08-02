import { describe, expect, it } from 'vitest';
import { isKnownSpaShellPath, looksLikeStaticAsset, normalizePathname } from './spa-paths.js';

describe('normalizePathname', () => {
  it('strips query strings and trailing slashes', () => {
    expect(normalizePathname('/play/sky-dodge?x=1')).toBe('/play/sky-dodge');
    expect(normalizePathname('/privacy/')).toBe('/privacy');
    expect(normalizePathname('/')).toBe('/');
  });
});

describe('looksLikeStaticAsset', () => {
  it('detects extension-bearing paths', () => {
    expect(looksLikeStaticAsset('/sw.js')).toBe(true);
    expect(looksLikeStaticAsset('/assets/index-AbCd.js')).toBe(true);
    expect(looksLikeStaticAsset('/icons/foo.png')).toBe(true);
    expect(looksLikeStaticAsset('/offline.html')).toBe(true);
  });

  it('does not treat SPA paths as assets', () => {
    expect(looksLikeStaticAsset('/play/sky-dodge')).toBe(false);
    expect(looksLikeStaticAsset('/nope')).toBe(false);
    expect(looksLikeStaticAsset('/')).toBe(false);
  });
});

describe('isKnownSpaShellPath', () => {
  it.each([
    '/',
    '/privacy',
    '/terms',
    '/health',
    '/contact',
    '/play/sky-dodge',
    '/ay/sky-dodge',
    '/ai/sky-dodge',
    '/draft/space-runner',
    '/status/tok-abc',
    '/studio',
    '/studio/tok-abc',
    // The surfaces the studio has now. `/thread` is where every deep link into a game
    // lands — it was answered with a 404 for as long as it existed, because this list
    // still described the five tabs it replaced.
    '/studio/tok-abc/thread',
    '/studio/tok-abc/details',
    '/studio/global-thermonuclear-strategy/thread',
    '/studio/tok-abc/playtest',
    // The names those absorbed. The client resolves them and rewrites the URL, so they
    // are real pages and must not be answered as typos.
    '/studio/tok-abc/build',
    '/studio/tok-abc/overview',
    '/studio/tok-abc/stats',
    '/studio/tok-abc/improve',
    '/admin',
    '/admin/queue',
    '/admin/costs',
    '/admin/telemetry',
    '/admin/tokens',
    '/admin/waitlist',
    '/join/K7M3QP',
  ])('treats %s as a known shell path (HTTP 200)', (path) => {
    expect(isKnownSpaShellPath(path)).toBe(true);
  });

  it.each([
    '/nope',
    '/this/does/not/exist',
    '/play/',
    '/play/-bad',
    '/play/Kotek%20W%20Cyrku',
    '/draft/',
    '/draft/..%2Fadmin',
    '/health/brick-storm',
    '/admin/nope',
    '/admin/queue/extra',
    '/studio/tok-abc/nope',
    '/studio/tok-abc/feedback',
    '/studio/tok-abc/build/extra',
    '/join/lower1',
    '/join/TOOLONG9',
    '/join/K7M3QP/extra',
  ])('treats %s as unknown (HTTP 404)', (path) => {
    expect(isKnownSpaShellPath(path)).toBe(false);
  });
});
