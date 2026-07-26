import { describe, expect, it } from 'vitest';
import {
  canonicalPlayPath,
  draftPath,
  joinPath,
  legalAnchor,
  legalPath,
  parsePathRoute,
  playPath,
  statusPath,
} from './router';

describe('parsePathRoute', () => {
  it('maps empty and root paths to home', () => {
    expect(parsePathRoute('')).toEqual({ view: 'home' });
    expect(parsePathRoute('/')).toEqual({ view: 'home' });
  });

  it('parses a status token', () => {
    expect(parsePathRoute('/status/abc123')).toEqual({ view: 'status', token: 'abc123' });
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

  it('parses the unlisted health route', () => {
    expect(parsePathRoute('/health')).toEqual({ view: 'health' });
    // Trailing segments are not the health view.
    expect(parsePathRoute('/health/brick-storm')).toEqual({ view: 'notFound' });
  });

  it('maps unknown paths to notFound', () => {
    expect(parsePathRoute('/nope')).toEqual({ view: 'notFound' });
    expect(parsePathRoute('/this/does/not/exist')).toEqual({ view: 'notFound' });
  });

  it('parses the legal routes', () => {
    expect(parsePathRoute('/privacy')).toEqual({ view: 'legal', doc: 'privacy' });
    expect(parsePathRoute('/terms')).toEqual({ view: 'legal', doc: 'terms' });
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

  it('builds a draft path that round-trips', () => {
    expect(draftPath('space-runner')).toBe('/draft/space-runner');
    expect(parsePathRoute(draftPath('space-runner'))).toEqual({ view: 'draft', slug: 'space-runner' });
  });

  it('percent-encodes status tokens', () => {
    expect(statusPath('a b')).toBe('/status/a%20b');
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
