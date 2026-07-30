import { describe, expect, it } from 'vitest';
import {
  canonicalPath,
  canonicalPlayPath,
  draftPath,
  joinPath,
  legalAnchor,
  legalPath,
  navUpTarget,
  parsePathRoute,
  playPath,
  statusPath,
  studioPath,
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

  it('parses a draft permalink and rejects non-slugs', () => {
    expect(parsePathRoute('/draft/space-runner')).toEqual({ view: 'draft', slug: 'space-runner' });
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

  it('parses the creator studio route', () => {
    expect(parsePathRoute('/studio')).toEqual({ view: 'studio' });
    expect(parsePathRoute('/studio/abc%2Ftoken')).toEqual({ view: 'studio', game: 'abc/token' });
    expect(parsePathRoute('/studio/abc%2Ftoken/build')).toEqual({
      view: 'studio',
      game: 'abc/token',
      tab: 'build',
    });
    expect(parsePathRoute('/studio/tok/playtest')).toEqual({ view: 'studio', game: 'tok', tab: 'playtest' });
    expect(parsePathRoute('/studio/tok/nope')).toEqual({ view: 'notFound' });
    // The stubbed feedback surface is gone from the UI, so its path is gone too —
    // otherwise a deep link resolves to a tab with nothing to render.
    expect(parsePathRoute('/studio/tok/feedback')).toEqual({ view: 'notFound' });
    // Trailing slash is not a studio deep-link.
    expect(parsePathRoute('/studio/')).toEqual({ view: 'notFound' });
  });

  it('maps unknown paths to notFound', () => {
    expect(parsePathRoute('/nope')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/this/does/not/exist')).toEqual({ view: 'notFound' });
  });

  it('parses the legal routes', () => {
    expect(parsePathRoute('/privacy')).toEqual({ view: 'legal', doc: 'privacy' });
    expect(parsePathRoute('/terms')).toEqual({ view: 'legal', doc: 'terms' });
  });

  it('parses the contact form route', () => {
    expect(parsePathRoute('/contact')).toEqual({ view: 'contact' });
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
    expect(canonicalPlayPath('/draft/sky-dodge')).toBeNull();
    expect(canonicalPlayPath('/')).toBeNull();
  });

  it('sends every old address to the one that replaced it', () => {
    // The aliases keep resolving — bookmarks, old emails, notifications sent months
    // ago — but the bar is put back on the current address so a copied URL survives.
    expect(canonicalPath('/ay/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPath('/ai/sky-dodge')).toBe('/play/sky-dodge');
    expect(canonicalPath('/health')).toBe('/admin/telemetry');
    expect(canonicalPath('/status/tok-abc')).toBe('/studio/tok-abc');
    // A bare /admin names no section; the queue is what it shows, so that is what it says.
    expect(canonicalPath('/admin')).toBe('/admin/queue');
  });

  it('leaves an address that is already current alone', () => {
    // Returning a path here would mean a replaceState on every navigation.
    expect(canonicalPath('/play/sky-dodge')).toBeNull();
    expect(canonicalPath('/admin/telemetry')).toBeNull();
    expect(canonicalPath('/studio/tok-abc')).toBeNull();
    expect(canonicalPath('/studio/tok-abc/build')).toBeNull();
    expect(canonicalPath('/studio')).toBeNull();
    expect(canonicalPath('/draft/sky-dodge')).toBeNull();
    expect(canonicalPath('/')).toBeNull();
    expect(canonicalPath('/nonsense')).toBeNull();
  });

  it('builds a draft path that round-trips', () => {
    expect(draftPath('space-runner')).toBe('/draft/space-runner');
    expect(parsePathRoute(draftPath('space-runner'))).toEqual({ view: 'draft', slug: 'space-runner' });
  });

  it('percent-encodes status tokens into studio paths', () => {
    expect(statusPath('a b')).toBe('/studio/a%20b');
  });

  it('builds a studio path that round-trips', () => {
    expect(studioPath()).toBe('/studio');
    expect(studioPath('tok')).toBe('/studio/tok');
    expect(studioPath('a b', 'stats')).toBe('/studio/a%20b/stats');
    expect(parsePathRoute(studioPath('a b'))).toEqual({ view: 'studio', game: 'a b' });
    expect(parsePathRoute(studioPath('tok', 'improve'))).toEqual({
      view: 'studio',
      game: 'tok',
      tab: 'improve',
    });
    // The address games actually carry now.
    expect(parsePathRoute(studioPath('tv-tycoon', 'build'))).toEqual({
      view: 'studio',
      game: 'tv-tycoon',
      tab: 'build',
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
  it('hides Up on home, join, play, draft, and studio playtest', () => {
    expect(navUpTarget({ view: 'home' })).toBeNull();
    expect(navUpTarget({ view: 'join', code: 'ABC123', token: 'tok' })).toBeNull();
    expect(navUpTarget({ view: 'play', slug: 'sky-dodge' })).toBeNull();
    expect(navUpTarget({ view: 'draft', slug: 'space-runner' })).toBeNull();
    expect(navUpTarget({ view: 'studio', game: 'tok', tab: 'playtest' })).toBeNull();
  });

  it('walks studio game work surfaces to the shelf, then home', () => {
    // Tab → shelf (not `/studio/:token`): a bare token URL is rewritten back onto
    // the default tab, which would cancel the Up for in-progress Build views.
    expect(navUpTarget({ view: 'studio', game: 'tok', tab: 'build' })).toEqual({
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
    expect(navUpTarget({ view: 'notFound' })).toEqual({ path: '/', labelKey: 'upHome' });
  });
});
