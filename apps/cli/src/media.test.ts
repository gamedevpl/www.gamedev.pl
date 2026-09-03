import { describe, expect, it } from 'vitest';
import { placeholderFor, probeGraphics } from './media.js';

describe('media probe', () => {
  it('does not guess graphics from a generic TERM', () => {
    expect(probeGraphics({ TERM: 'xterm-256color' }, true)).toBe('none');
    expect(probeGraphics({ KITTY_WINDOW_ID: '1', TERM: 'xterm-256color' }, true)).toBe('kitty');
    expect(probeGraphics({ ITERM_SESSION_ID: 'w0t0p0:abc' }, true)).toBe('iterm2');
    expect(probeGraphics({ TERM: 'xterm-kitty' }, false)).toBe('none');
  });

  it('boxes a still when graphics are unavailable', () => {
    expect(placeholderFor('https://www.gamedev.pl/api/media/x')).toContain('o open');
  });
});
