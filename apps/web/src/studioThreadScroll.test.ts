import { describe, expect, it } from 'vitest';
import { studioThreadContentScrollTop, studioThreadNearContentEnd } from './studioThreadScroll.js';

function fakePane(opts: { scrollHeight: number; clientHeight: number; scrollTop?: number; padHeight: number }) {
  return {
    scrollHeight: opts.scrollHeight,
    clientHeight: opts.clientHeight,
    scrollTop: opts.scrollTop ?? 0,
    querySelector: (selector: string) => {
      if (selector !== '.studio-thread-scroll-pad') return null;
      return { offsetHeight: opts.padHeight } as HTMLElement;
    },
  };
}

describe('studioThreadScroll', () => {
  it('sticks to the content end, not the runway pad', () => {
    // 400px turns + 350px pad; content end is 0.
    const pane = fakePane({ scrollHeight: 750, clientHeight: 400, padHeight: 350 });
    expect(studioThreadContentScrollTop(pane)).toBe(0);
    expect(studioThreadNearContentEnd({ ...pane, scrollTop: 0 })).toBe(true);
    // Absolute bottom still counts as following.
    expect(studioThreadNearContentEnd({ ...pane, scrollTop: 350 })).toBe(true);
  });

  it('leaves history readers unstuck when they scroll up', () => {
    const pane = fakePane({
      scrollHeight: 2000,
      clientHeight: 400,
      padHeight: 350,
      scrollTop: 200,
    });
    expect(studioThreadContentScrollTop(pane)).toBe(1250);
    expect(studioThreadNearContentEnd(pane)).toBe(false);
  });

  it('treats a missing pad as a normal chat scroller', () => {
    const pane = {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 600,
      querySelector: () => null,
    };
    expect(studioThreadContentScrollTop(pane)).toBe(600);
    expect(studioThreadNearContentEnd(pane)).toBe(true);
    expect(studioThreadNearContentEnd({ ...pane, scrollTop: 100 })).toBe(false);
  });
});
