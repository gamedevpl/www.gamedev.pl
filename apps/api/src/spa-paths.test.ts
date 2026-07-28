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
    '/studio/tok-abc/build',
    '/studio/tok-abc/playtest',
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
    '/studio/tok-abc/nope',
    '/studio/tok-abc/build/extra',
    '/join/lower1',
    '/join/TOOLONG9',
    '/join/K7M3QP/extra',
  ])('treats %s as unknown (HTTP 404)', (path) => {
    expect(isKnownSpaShellPath(path)).toBe(false);
  });
});
