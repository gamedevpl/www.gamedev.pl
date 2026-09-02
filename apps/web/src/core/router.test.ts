import { describe, expect, it } from 'vitest';
import {
  canonicalPath,
  canonicalPlayPath,
  betaInvitePath,
  creatorPath,
  gamePath,
  joinPath,
  legalAnchor,
  legalPath,
  navUpTarget,
  parsePathRoute,
  playPath,
  statusPath,
  studioPath,
  studioWelcomePath,
  studioConnectPath,
} from './router.js';

describe('parsePathRoute', () => {
  it('maps empty and root paths to home', () => {
    expect(parsePathRoute('')).toEqual({ view: 'home' });
    expect(parsePathRoute('/')).toEqual({ view: 'home' });
  });

  it('parses a status token into Creator Studio (legacy alias)', () => {
    expect(parsePathRoute('/status/abc123')).toEqual({ view: 'studio', game: 'abc123' });
  });

  it('parses a published-game permalink', () => {
    expect(parsePathRoute('/play/kotek-w-cyrku')).toEqual({ view: 'play', slug: 'kotek-w-cyrku' });
    expect(parsePathRoute('/play/dodge')).toEqual({ view: 'play', slug: 'dodge' });
  });

  it('accepts /ay and /ai as play aliases', () => {
    expect(parsePathRoute('/ay/sky-dodge')).toEqual({ view: 'play', slug: 'sky-dodge' });
    expect(parsePathRoute('/ai/sky-dodge')).toEqual({ view: 'play', slug: 'sky-dodge' });
    expect(parsePathRoute('/ay/-bad')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/ai/')).toEqual({ view: 'notFound' });
  });

  it('rejects non-slug play paths', () => {
    expect(parsePathRoute('/play/Kotek W Cyrku')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/play/..%2Fadmin')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/play/a/b')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/play/-bad')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/play/')).toEqual({ view: 'notFound' });
  });

  it('treats legacy /draft/<slug> as the /play/<slug> permalink', () => {
    expect(parsePathRoute('/draft/space-runner')).toEqual({ view: 'play', slug: 'space-runner' });
    expect(parsePathRoute('/draft/..%2Fadmin')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/draft/')).toEqual({ view: 'notFound' });
  });

  it('parses a hybrid join link (code in path, token in fragment)', () => {
    expect(parsePathRoute('/join/ABC123', '#tok_en-1')).toEqual({
      view: 'join',
      code: 'ABC123',
      token: 'tok_en-1',
    });
    expect(parsePathRoute('/join/K7M3QP', 'abc-DEF_123')).toEqual({
      view: 'join',
      code: 'K7M3QP',
      token: 'abc-DEF_123',
    });
  });

  it('parses one-time beta invite links and rejects malformed codes', () => {
    const code = 'Abc123_-'.repeat(4);
    expect(parsePathRoute(betaInvitePath(code))).toEqual({ view: 'invite', code });
    expect(parsePathRoute('/invite/too-short')).toEqual({ view: 'notFound' });
    expect(parsePathRoute(`/invite/${'a'.repeat(33)}`)).toEqual({ view: 'notFound' });
  });

  it('maps malformed join links to notFound', () => {
    expect(parsePathRoute('/join/lower1', '#token')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/join/TOOLONG9', '#token')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/join/K7M3QP')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/join/K7M3QP/tok/en')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/join/K7M3QP/abc-DEF_123')).toEqual({ view: 'notFound' });
  });

  it('survives malformed percent-encoding on every segment it decodes', () => {
    // `decodeURIComponent('%E0')` throws. Each of these used to take the SPA with it.
    expect(parsePathRoute('/play/%E0')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/draft/%E0')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/status/%E0')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/studio/%E0')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/studio/tok/%E0')).toEqual({ view: 'notFound' });
  });

  it('parses the unlisted operator console, and keeps its old address working', () => {
    expect(parsePathRoute('/admin')).toEqual({ view: 'admin', section: 'queue' });
    expect(parsePathRoute('/admin/telemetry')).toEqual({ view: 'admin', section: 'telemetry' });
    expect(parsePathRoute('/admin/assessments')).toEqual({ view: 'admin', section: 'assessments' });
    // `/health` was the whole operator page before the console existed, and is what is
    // in the operator's bookmarks — it resolves to the section it used to be.
    expect(parsePathRoute('/health')).toEqual({ view: 'admin', section: 'telemetry' });
    // A section that does not exist is a typo, and says so.
    expect(parsePathRoute('/admin/nope')).toEqual({ view: 'notFound' });
    // Malformed percent-encoding is a 404, not a URIError: route parsing runs on every
    // navigation, and a throw there takes the whole app down.
    expect(parsePathRoute('/admin/%E0')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/health/brick-storm')).toEqual({ view: 'notFound' });
  });

  it('parses the unlisted reviewer assessment desk', () => {
    expect(parsePathRoute('/review')).toEqual({ view: 'review' });
  });

  it('parses the creator studio route', () => {
    expect(parsePathRoute('/studio')).toEqual({ view: 'studio' });
    expect(parsePathRoute('/studio/abc%2Ftoken')).toEqual({ view: 'studio', game: 'abc/token' });
    // 'build' is one of the five names the three surfaces absorbed; it resolves to
    // the surface rather than being carried around as itself.
    expect(parsePathRoute('/studio/abc%2Ftoken/build')).toEqual({
      view: 'studio',
      game: 'abc/token',
      tab: 'thread',
    });
    // Play is a posture of the stage now, not a place — `/playtest` still resolves,
    // onto the thread tab with `posture: 'play'` carrying the old meaning forward.
    expect(parsePathRoute('/studio/tok/playtest')).toEqual({
      view: 'studio',
      game: 'tok',
      tab: 'thread',
      posture: 'play',
    });
    expect(parsePathRoute('/studio/tok/nope')).toEqual({ view: 'notFound' });
    // The stubbed feedback surface is gone from the UI, so its path is gone too —
    // otherwise a deep link resolves to a tab with nothing to render.
    expect(parsePathRoute('/studio/tok/feedback')).toEqual({ view: 'notFound' });
    // Trailing slash is not a studio deep-link.
    expect(parsePathRoute('/studio/')).toEqual({ view: 'notFound' });
  });

  it('parses the platform create handoff chapter', () => {
    expect(parsePathRoute('/studio/bastion-wave-defense/welcome')).toEqual({
      view: 'studioWelcome',
      game: 'bastion-wave-defense',
    });
    expect(parsePathRoute('/studio/tok/welcome')).toEqual({ view: 'studioWelcome', game: 'tok' });
    expect(studioWelcomePath('tv-tycoon')).toBe('/studio/tv-tycoon/welcome');
    expect(canonicalPath('/studio/tv-tycoon/welcome')).toBeNull();
    expect(navUpTarget({ view: 'studioWelcome', game: 'tv-tycoon' })).toEqual({
      path: '/studio',
      labelKey: 'upStudio',
    });
  });

  it('parses the BYOCA connect chapter', () => {
    expect(parsePathRoute('/studio/bastion-wave/connect')).toEqual({
      view: 'studioConnect',
      game: 'bastion-wave',
    });
    expect(studioConnectPath('tv-tycoon')).toBe('/studio/tv-tycoon/connect');
    expect(navUpTarget({ view: 'studioConnect', game: 'tv-tycoon' })).toEqual({
      path: '/studio',
      labelKey: 'upStudio',
    });
  });

  it('maps unknown paths to notFound', () => {
    expect(parsePathRoute('/this/does/not/exist')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/NotAHandle')).toEqual({ view: 'notFound' });
  });

  it('parses public game page routes', () => {
    expect(parsePathRoute('/nightshift/neon-courier')).toEqual({
      view: 'game',
      handle: 'nightshift',
      slug: 'neon-courier',
    });
    for (const tab of ['board', 'review', 'releases', 'sources'] as const) {
      expect(parsePathRoute(`/nightshift/neon-courier/${tab}`)).toEqual({
        view: 'game',
        handle: 'nightshift',
        slug: 'neon-courier',
      });
    }
    expect(parsePathRoute('/gamedevpl')).toEqual({ view: 'creator', handle: 'gamedevpl' });
    expect(parsePathRoute('/gamedevpl/brick-storm')).toEqual({
      view: 'game',
      handle: 'gamedevpl',
      slug: 'brick-storm',
    });
    expect(parsePathRoute('/health/brick-storm')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/studio/brick-storm')).toEqual({ view: 'studio', game: 'brick-storm' });
    expect(parsePathRoute('/nightshift/neon-courier/nope')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/Nightshift/neon-courier')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/nightshift/Neon%20Courier')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/nightshift/-bad')).toEqual({ view: 'notFound' });
    // First-class product segments keep their meaning; they never become handles.
    expect(parsePathRoute('/play/neon-courier')).toEqual({ view: 'play', slug: 'neon-courier' });
    expect(parsePathRoute('/creators/ada')).toEqual({ view: 'creator', handle: 'ada' });
  });

  it('parses the legal routes', () => {
    expect(parsePathRoute('/privacy')).toEqual({ view: 'legal', doc: 'privacy' });
    expect(parsePathRoute('/terms')).toEqual({ view: 'legal', doc: 'terms' });
  });

  it('parses the contact form route', () => {
    expect(parsePathRoute('/contact')).toEqual({ view: 'contact' });
  });

  it('parses the creation landing route, and reserves the handle', () => {
    expect(parsePathRoute('/create')).toEqual({ view: 'create' });
    // Same reserved-segment protection as the other first-class routes.
    expect(parsePathRoute('/create/some-game')).toEqual({ view: 'notFound' });
  });

  it('parses the party landing route, and reserves the handle', () => {
    expect(parsePathRoute('/party')).toEqual({ view: 'party' });
    // Same reserved-segment protection as the other first-class routes.
    expect(parsePathRoute('/party/some-game')).toEqual({ view: 'notFound' });
  });

  it('parses public creator profile routes', () => {
    expect(parsePathRoute('/ada')).toEqual({ view: 'creator', handle: 'ada' });
    expect(parsePathRoute('/ada_lovelace')).toEqual({ view: 'creator', handle: 'ada_lovelace' });
    expect(parsePathRoute('/creators/ada')).toEqual({ view: 'creator', handle: 'ada' });
    expect(parsePathRoute('/creators/ada_lovelace')).toEqual({ view: 'creator', handle: 'ada_lovelace' });
    expect(parsePathRoute('/creators/ab')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/creators/Ada')).toEqual({ view: 'notFound' });
  });

  // A cited clause has to survive the trip: `/terms#zglaszanie` is what goes into a
  // reply telling someone how to report content, and if the fragment knocked the
  // route back to home it would land them on the front page instead.
  it('keeps the route when a section anchor rides along', () => {
    expect(parsePathRoute('/terms', '#zglaszanie')).toEqual({ view: 'legal', doc: 'terms' });
    expect(parsePathRoute('/privacy', '#prawa')).toEqual({ view: 'legal', doc: 'privacy' });
  });
});

describe('legalAnchor', () => {
  it('extracts the section anchor, and nothing when there is none', () => {
    expect(legalAnchor('#zglaszanie')).toBe('zglaszanie');
    expect(legalAnchor('')).toBeNull();
    expect(legalAnchor('#')).toBeNull();
  });
});

describe('path builders', () => {
  it('builds a play path that round-trips', () => {
    expect(playPath('kotek-w-cyrku')).toBe('/play/kotek-w-cyrku');
    expect(parsePathRoute(playPath('space-dash'))).toEqual({ view: 'play', slug: 'space-dash' });
  });

  it('canonicalizes play aliases to /play/<slug>', () => {
    expect(canonicalPlayPath('/ay/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPlayPath('/ai/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPlayPath('/play/sky-dodge')).toBeNull();
    expect(canonicalPlayPath('/draft/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPlayPath('/')).toBeNull();
  });

  it('sends every old address to the one that replaced it', () => {
    // The aliases keep resolving — bookmarks, old emails, notifications sent months
    // ago — but the bar is put back on the current address so a copied URL survives.
    expect(canonicalPath('/ay/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPath('/ai/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPath('/draft/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPath('/health')).toBe('/admin/telemetry');
    expect(canonicalPath('/status/tok-abc')).toBe('/studio/tok-abc');
    expect(canonicalPath('/creators/ada')).toBe('/ada');
    // A bare /admin names no section; the queue is what it shows, so that is what it says.
    expect(canonicalPath('/admin')).toBe('/admin/queue');
    // An old tab name is not the current address for the surface that absorbed it.
    expect(canonicalPath('/studio/tv-tycoon/build')).toBe('/studio/tv-tycoon/thread');
    expect(canonicalPath('/studio/tv-tycoon/stats')).toBe('/studio/tv-tycoon/details');
    // `/playtest` must NOT be eagerly rewritten: `readLocationRoute` in App.tsx runs
    // this before React ever mounts, and an eager rewrite here drops the `posture:
    // 'play'` deep link before CreatorStudioView gets a chance to read it (caught by
    // hand-testing in a real browser, not by the component-level tests, which pass
    // `selectedPosture` directly and never exercise this canonicalization step).
    expect(canonicalPath('/studio/tv-tycoon/playtest')).toBeNull();
    expect(canonicalPath('/nightshift/neon-courier/board')).toBe('/nightshift/neon-courier');
    expect(canonicalPath('/nightshift/neon-courier/review')).toBe('/nightshift/neon-courier');
    expect(canonicalPath('/nightshift/neon-courier/releases')).toBe('/nightshift/neon-courier');
    expect(canonicalPath('/nightshift/neon-courier/sources')).toBe('/nightshift/neon-courier');
  });

  it('leaves an address that is already current alone', () => {
    // Returning a path here would mean a replaceState on every navigation.
    expect(canonicalPath('/play/sky-dodge')).toBeNull();
    expect(canonicalPath('/admin/telemetry')).toBeNull();
    expect(canonicalPath('/studio/tok-abc')).toBeNull();
    expect(canonicalPath('/studio/tok-abc/thread')).toBeNull();
    expect(canonicalPath('/studio')).toBeNull();
    expect(canonicalPath('/ada')).toBeNull();
    expect(canonicalPath('/')).toBeNull();
    expect(canonicalPath('/NotAHandle')).toBeNull();
  });

  it('builds a root creator path that round-trips', () => {
    expect(creatorPath('ada')).toBe('/ada');
    expect(parsePathRoute(creatorPath('ada'))).toEqual({ view: 'creator', handle: 'ada' });
  });

  it('builds a game page path that round-trips', () => {
    expect(gamePath('nightshift', 'neon-courier')).toBe('/nightshift/neon-courier');
    expect(parsePathRoute(gamePath('nightshift', 'neon-courier'))).toEqual({
      view: 'game',
      handle: 'nightshift',
      slug: 'neon-courier',
    });
    expect(parsePathRoute('/nightshift/neon-courier/board')).toEqual({
      view: 'game',
      handle: 'nightshift',
      slug: 'neon-courier',
    });
  });

  it('sends game page Up to the owning creator profile', () => {
    expect(navUpTarget({ view: 'game', handle: 'nightshift', slug: 'neon-courier' })).toEqual({
      path: '/nightshift',
      labelKey: 'upCreator',
    });
    expect(navUpTarget({ view: 'game', handle: 'gamedevpl', slug: 'brick-storm' })).toEqual({
      path: '/gamedevpl',
      labelKey: 'upCreator',
    });
  });

  it('percent-encodes status tokens into studio paths', () => {
    expect(statusPath('a b')).toBe('/studio/a%20b');
  });

  it('builds a studio path that round-trips', () => {
    expect(studioPath()).toBe('/studio');
    expect(studioPath('tok')).toBe('/studio/tok');
    expect(studioPath('a b', 'details')).toBe('/studio/a%20b/details');
    expect(parsePathRoute(studioPath('a b'))).toEqual({ view: 'studio', game: 'a b' });
    expect(parsePathRoute(studioPath('tok', 'thread'))).toEqual({
      view: 'studio',
      game: 'tok',
      tab: 'thread',
    });
    // The five-tab vocabulary that came before, resolved onto the surface that
    // absorbed each one. Old bookmarks and notification links have to land somewhere
    // real, and they land on the thread or beside it rather than on a 404.
    for (const [old, surface] of [
      ['build', 'thread'],
      ['improve', 'thread'],
      ['overview', 'details'],
      ['stats', 'details'],
      ['playtest', 'thread'],
    ] as const) {
      expect(parsePathRoute(`/studio/tv-tycoon/${old}`)).toEqual({
        view: 'studio',
        game: 'tv-tycoon',
        tab: surface,
        ...(old === 'playtest' ? { posture: 'play' } : {}),
      });
    }
    // Still a 404 for a segment that never named anything.
    expect(parsePathRoute('/studio/tv-tycoon/nonsense')).toEqual({ view: 'notFound' });

    // The address games actually carry now.
    expect(parsePathRoute(studioPath('tv-tycoon', 'thread'))).toEqual({
      view: 'studio',
      game: 'tv-tycoon',
      tab: 'thread',
    });
  });

  it('builds a hybrid join path that round-trips', () => {
    const path = joinPath('K7M3QP', 'abc-DEF_123');
    expect(path).toBe('/join/K7M3QP#abc-DEF_123');
    const [pathname, fragment = ''] = path.split('#');
    expect(parsePathRoute(pathname!, `#${fragment}`)).toEqual({
      view: 'join',
      code: 'K7M3QP',
      token: 'abc-DEF_123',
    });
  });

  it('round-trips a legal document, with and without a section', () => {
    expect(legalPath('privacy')).toBe('/privacy');
    expect(legalPath('terms', 'reklamacje')).toBe('/terms#reklamacje');

    const [path, fragment] = legalPath('terms', 'reklamacje').split('#');
    expect(parsePathRoute(path!, `#${fragment}`)).toEqual({ view: 'legal', doc: 'terms' });
    expect(legalAnchor(`#${fragment}`)).toBe('reklamacje');
  });
});

describe('navUpTarget', () => {
  it('hides Up on overlays and gives the static play page a home parent', () => {
    expect(navUpTarget({ view: 'home' })).toBeNull();
    expect(navUpTarget({ view: 'join', code: 'ABC123', token: 'tok' })).toBeNull();
    expect(navUpTarget({ view: 'play', slug: 'sky-dodge' })).toEqual({ path: '/', labelKey: 'upHome' });
    expect(navUpTarget({ view: 'studio', game: 'tok', tab: 'thread', posture: 'play' })).toBeNull();
  });

  it('walks studio game work surfaces to the shelf, then home', () => {
    // Surface → shelf (not `/studio/:game`): a bare game URL is rewritten back onto
    // the default surface, which would cancel the Up for a thread view.
    expect(navUpTarget({ view: 'studio', game: 'tok', tab: 'thread' })).toEqual({
      path: '/studio',
      labelKey: 'upStudio',
    });
    expect(navUpTarget({ view: 'studio', game: 'tok' })).toEqual({
      path: '/studio',
      labelKey: 'upStudio',
    });
    expect(navUpTarget({ view: 'studio' })).toEqual({
      path: '/',
      labelKey: 'upHome',
    });
  });

  it('sends browsable non-studio surfaces home', () => {
    expect(navUpTarget({ view: 'admin', section: 'queue' })).toEqual({ path: '/', labelKey: 'upHome' });
    expect(navUpTarget({ view: 'legal', doc: 'privacy' })).toEqual({ path: '/', labelKey: 'upHome' });
    expect(navUpTarget({ view: 'contact' })).toEqual({ path: '/', labelKey: 'upHome' });
    expect(navUpTarget({ view: 'create' })).toEqual({ path: '/', labelKey: 'upHome' });
    expect(navUpTarget({ view: 'party' })).toEqual({ path: '/', labelKey: 'upHome' });
    expect(navUpTarget({ view: 'creator', handle: 'ada' })).toEqual({ path: '/', labelKey: 'upHome' });
    expect(navUpTarget({ view: 'notFound' })).toEqual({ path: '/', labelKey: 'upHome' });
  });
});

describe('proposals route', () => {
  it('parses the tracker path', () => {
    expect(parsePathRoute('/proposals')).toEqual({ view: 'proposals' });
  });

  it('does not swallow a handle that starts the same way', () => {
    // `/proposals` is a first-class route, so it is also reserved against handles —
    // the root namespace is shared with creator profiles.
    expect(parsePathRoute('/proposalsx')).toEqual({ view: 'creator', handle: 'proposalsx' });
  });

  it('404s a deeper path rather than falling back to the tracker', () => {
    expect(parsePathRoute('/proposals/123')).toEqual({ view: 'notFound' });
  });
});

describe('reserved product segments', () => {
  it('keeps /proposals as the tracker even though the root namespace holds handles', () => {
    // `proposals` is also in the API's RESERVED_HANDLES, so no profile can claim it —
    // this is the client half of that contract, and the ordering is defense in depth.
    expect(parsePathRoute('/proposals')).toEqual({ view: 'proposals' });
  });
});
