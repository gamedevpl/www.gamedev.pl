import { describe, expect, it } from 'vitest';
import { clampSheetDragHeight, nextSheetDetent, snapSheetDetent } from './studioChatSheet.js';

describe('studio chat sheet detents', () => {
  it('cycles peek → half → full → peek', () => {
    expect(nextSheetDetent('peek')).toBe('half');
    expect(nextSheetDetent('half')).toBe('full');
    expect(nextSheetDetent('full')).toBe('peek');
  });

  it('snaps a dragged height to the nearest detent', () => {
    expect(snapSheetDetent(130, 800)).toBe('peek');
    expect(snapSheetDetent(380, 800)).toBe('half');
    expect(snapSheetDetent(700, 800)).toBe('full');
  });

  it('clamps a live drag between peek and nearly the viewport', () => {
    expect(clampSheetDragHeight(10, 800)).toBe(124);
    expect(clampSheetDragHeight(900, 800)).toBe(752);
    expect(clampSheetDragHeight(400, 800)).toBe(400);
  });
});
