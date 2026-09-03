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
    '/connect',
    '/mcp',
    '/create',
    '/party',
    '/ada',
    '/ada_lovelace',
    '/creators/ada',
    '/creators/ada_lovelace',
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
    '/studio/tok-abc/edit',
    // The Code surface (CE-06) — a reload while it is open lands on this URL.
    '/studio/tok-abc/code',
    '/studio/sky-dodge/code',
    '/studio/tok-abc/welcome',
    '/studio/tok-abc/connect',
    '/admin',
    '/admin/queue',
    '/admin/costs',
    '/admin/telemetry',
    '/admin/tokens',
    '/admin/waitlist',
    '/admin/assessments',
    '/review',
    '/join/K7M3QP',
    `/invite/${'Abc123_-'.repeat(4)}`,
    '/nightshift/neon-courier',
    // The platform's namespace is reserved against claiming but is a real address:
    // it is where every game with no creator to name lives.
    '/gamedevpl/brick-storm',
    '/gamedevpl/brick-storm/releases',
    '/nightshift/neon-courier/board',
    '/nightshift/neon-courier/review',
    '/nightshift/neon-courier/releases',
    '/nightshift/neon-courier/sources',
  ])('treats %s as a known shell path (HTTP 200)', (path) => {
    expect(isKnownSpaShellPath(path)).toBe(true);
  });

  it.each([
    '/this/does/not/exist',
    '/NotAHandle',
    '/play/',
    '/play/-bad',
    '/play/Kotek%20W%20Cyrku',
    '/draft/',
    '/draft/..%2Fadmin',
    '/health/brick-storm',
    '/create/some-game',
    '/party/some-game',
    '/admin/nope',
    '/admin/queue/extra',
    '/studio/tok-abc/nope',
    '/studio/tok-abc/feedback',
    '/studio/tok-abc/build/extra',
    '/join/lower1',
    '/join/TOOLONG9',
    '/join/K7M3QP/extra',
    '/invite/too-short',
    `/invite/${'a'.repeat(33)}`,
    // Game page: reserved first segments, bad slugs, and unknown tabs stay 404.
    '/studio/neon-courier/releases/extra',
    '/play/neon-courier/board',
    '/nightshift/Neon%20Courier',
    '/nightshift/neon-courier/nope',
    '/nightshift/neon-courier/board/extra',
  ])('treats %s as unknown (HTTP 404)', (path) => {
    expect(isKnownSpaShellPath(path)).toBe(false);
  });
});
