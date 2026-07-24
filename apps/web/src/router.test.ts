import { describe, expect, it } from 'vitest';
import { parseHashRoute, playHash, statusHash } from './router';

describe('parseHashRoute', () => {
  it('maps empty and root hashes to home', () => {
    expect(parseHashRoute('')).toEqual({ view: 'home' });
    expect(parseHashRoute('#')).toEqual({ view: 'home' });
    expect(parseHashRoute('#/')).toEqual({ view: 'home' });
  });

  it('parses a status route', () => {
    expect(parseHashRoute('#/status/abc123')).toEqual({ view: 'status', token: 'abc123' });
  });

  it('parses a play route with a valid slug', () => {
    expect(parseHashRoute('#/play/kotek-w-cyrku')).toEqual({ view: 'play', slug: 'kotek-w-cyrku' });
    expect(parseHashRoute('#/play/dodge')).toEqual({ view: 'play', slug: 'dodge' });
  });

  it('rejects malformed play slugs (falls back to home)', () => {
    // Uppercase, spaces, path traversal, nested segments, trailing dash — none are valid slugs.
    expect(parseHashRoute('#/play/Kotek W Cyrku')).toEqual({ view: 'home' });
    expect(parseHashRoute('#/play/..%2Fadmin')).toEqual({ view: 'home' });
    expect(parseHashRoute('#/play/a/b')).toEqual({ view: 'home' });
    expect(parseHashRoute('#/play/-bad')).toEqual({ view: 'home' });
    expect(parseHashRoute('#/play/')).toEqual({ view: 'home' });
  });

  it('parses a join route', () => {
    expect(parseHashRoute('#/join/ABC123/tok_en-1')).toEqual({ view: 'join', code: 'ABC123', token: 'tok_en-1' });
  });

  it('falls back to home on anything unrecognized', () => {
    expect(parseHashRoute('#/nope')).toEqual({ view: 'home' });
  });
});

describe('hash builders', () => {
  it('round-trips a play slug', () => {
    expect(playHash('kotek-w-cyrku')).toBe('#/play/kotek-w-cyrku');
    expect(parseHashRoute(playHash('space-dash'))).toEqual({ view: 'play', slug: 'space-dash' });
  });

  it('encodes status tokens', () => {
    expect(statusHash('a b')).toBe('#/status/a%20b');
  });
});
