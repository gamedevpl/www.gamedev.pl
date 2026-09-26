import { describe, expect, it } from 'vitest';
import { isPlayPermalinkPath } from './security-headers.js';

describe('play permalink framing path', () => {
  it.each(['/%70lay/unicorn-snap', '/play%2Funicorn-snap', '/play/unicorn%2Fsnap'])(
    'rejects encoded route syntax at %s',
    (url) => {
      expect(isPlayPermalinkPath(url)).toBe(false);
    },
  );

  it('accepts encoding within the slug', () => {
    expect(isPlayPermalinkPath('/play/unicorn%2Dsnap')).toBe(true);
  });
});
