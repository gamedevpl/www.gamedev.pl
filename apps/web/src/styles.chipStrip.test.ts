import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

/**
 * Returns the declarations of the LAST `.chip-container { ... }` block, which is the
 * phone one — the desktop rule above it wraps instead of scrolling and is unaffected.
 */
function mobileChipContainerRule(): string {
  const marker = '.chip-container {';
  const start = css.lastIndexOf(marker);
  expect(start, 'no .chip-container rule in styles.css').toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, '.chip-container rule is never closed').toBeGreaterThan(start);
  return css.slice(start + marker.length, end);
}

describe('mobile suggestion chip strip', () => {
  const rule = mobileChipContainerRule();

  it('is a bleeding horizontal scroller, not a wrapped stack', () => {
    // Three wrapped chips cost ~148px of an iPhone SE. The strip trades that for
    // one 44px row that bleeds to the content edge so a cut-off chip advertises the swipe.
    expect(rule).toMatch(/flex-wrap:\s*nowrap/);
    expect(rule).toMatch(/overflow-x:\s*auto/);
    expect(rule).toMatch(/margin:\s*0 -12px/);
    expect(rule).toMatch(/padding:\s*0 12px/);
  });

  /**
   * Regression: chips appeared to fall out of the card on a phone.
   *
   * The bleed puts the scrollport edge exactly on the content edge, and
   * `.chip-btn` carries `scroll-snap-align: start`. Snapping aligns a chip to the
   * snapport start, so the browser scrolled the 12px padding away to satisfy it
   * (scrollLeft settled at 12, not 0) and the first chip came to rest sliced by the
   * viewport. Any padding here has to be mirrored in scroll-padding or
   * snapping simply undoes it.
   */
  it('keeps its inset under scroll snapping', () => {
    if (/scroll-snap-type/.test(rule)) {
      expect(rule, 'scroll-snap-type without scroll-padding scrolls the padding away').toMatch(
        /scroll-padding:\s*0 12px/,
      );
    }
  });

  /**
   * The chip that runs past the edge was cut dead, which reads as
   * broken layout rather than as more-to-swipe. Both ends of the strip are empty at
   * their scroll extremes, so a 12px fade at each end only bites while there is
   * actually something further to reach.
   */
  it('fades the bleed at both ends instead of guillotining a chip', () => {
    expect(rule).toMatch(/-webkit-mask-image:\s*linear-gradient\(to right/);
    expect(rule).toMatch(/[^-]mask-image:\s*linear-gradient\(to right/);
    expect(rule).toMatch(/transparent,\s*#000 12px,\s*#000 calc\(100% - 12px\),\s*transparent/);
  });
});
