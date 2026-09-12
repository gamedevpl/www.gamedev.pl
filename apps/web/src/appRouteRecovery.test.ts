// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { readLocationRoute } from './appRouteRecovery.js';

describe('readLocationRoute', () => {
  afterEach(() => {
    window.history.pushState(null, '', '/');
  });

  it('keeps search and hash when rewriting a play alias', () => {
    window.history.pushState(null, '', '/ay/airtime?utm_source=js13k&utm_term=drop#seat');
    expect(readLocationRoute()).toEqual({ view: 'play', slug: 'airtime' });
    expect(window.location.pathname).toBe('/play/airtime');
    expect(window.location.search).toBe('?utm_source=js13k&utm_term=drop');
    expect(window.location.hash).toBe('#seat');
  });

  it('keeps search when decoding a percent-encoded play slug', () => {
    window.history.pushState(null, '', '/play/unicorn%2Dsnap?utm_source=js13k');
    expect(readLocationRoute()).toEqual({ view: 'play', slug: 'unicorn-snap' });
    expect(window.location.pathname).toBe('/play/unicorn-snap');
    expect(window.location.search).toBe('?utm_source=js13k');
  });
});
