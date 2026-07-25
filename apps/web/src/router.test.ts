import { describe, expect, it } from 'vitest';
import { draftPath, joinPath, parsePathRoute, playPath, statusPath } from './router';

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

  it('rejects non-slug play paths', () => {
    expect(parsePathRoute('/play/Kotek W Cyrku')).toEqual({ view: 'home' });
    expect(parsePathRoute('/play/..%2Fadmin')).toEqual({ view: 'home' });
    expect(parsePathRoute('/play/a/b')).toEqual({ view: 'home' });
    expect(parsePathRoute('/play/-bad')).toEqual({ view: 'home' });
    expect(parsePathRoute('/play/')).toEqual({ view: 'home' });
  });

  it('parses a draft permalink and rejects non-slugs', () => {
    expect(parsePathRoute('/draft/space-runner')).toEqual({ view: 'draft', slug: 'space-runner' });
    expect(parsePathRoute('/draft/..%2Fadmin')).toEqual({ view: 'home' });
    expect(parsePathRoute('/draft/')).toEqual({ view: 'home' });
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

  it('falls back home for malformed join links', () => {
    expect(parsePathRoute('/join/lower1', '#token')).toEqual({ view: 'home' });
    expect(parsePathRoute('/join/TOOLONG9', '#token')).toEqual({ view: 'home' });
    expect(parsePathRoute('/join/K7M3QP')).toEqual({ view: 'home' });
    expect(parsePathRoute('/join/K7M3QP/tok/en')).toEqual({ view: 'home' });
    expect(parsePathRoute('/join/K7M3QP/abc-DEF_123')).toEqual({ view: 'home' });
  });

  it('parses the unlisted health route', () => {
    expect(parsePathRoute('/health')).toEqual({ view: 'health' });
    // Trailing segments are not the health view.
    expect(parsePathRoute('/health/brick-storm')).toEqual({ view: 'home' });
  });

  it('falls back to home for unknown paths', () => {
    expect(parsePathRoute('/nope')).toEqual({ view: 'home' });
  });
});

describe('path builders', () => {
  it('builds a play path that round-trips', () => {
    expect(playPath('kotek-w-cyrku')).toBe('/play/kotek-w-cyrku');
    expect(parsePathRoute(playPath('space-dash'))).toEqual({ view: 'play', slug: 'space-dash' });
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
});
