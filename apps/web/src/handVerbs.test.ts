import { describe, expect, it } from 'vitest';
import {
  HAND_AIM_MIN_INTERVAL_MS,
  PINCH_OFF,
  PINCH_ON,
  PINCH_REFRACTORY_MS,
  aimFromIndexTip,
  createHandVerbState,
  pinchDistance,
  sampleHandVerbs,
  type Landmark,
} from './handVerbs.js';

function tips(thumb: Landmark, index: Landmark): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  pts[4] = thumb;
  pts[8] = index;
  return pts;
}

describe('aimFromIndexTip', () => {
  it('maps image centre to stick zero', () => {
    expect(aimFromIndexTip({ x: 0.5, y: 0.5 }, false)).toEqual({ x: 0, y: 0 });
  });

  it('maps top-left of the image to up-left without mirror', () => {
    expect(aimFromIndexTip({ x: 0, y: 0 }, false)).toEqual({ x: -1, y: 1 });
  });

  it('mirrors x for a user-facing camera', () => {
    expect(aimFromIndexTip({ x: 0, y: 0.5 }, true)).toEqual({ x: 1, y: 0 });
    expect(aimFromIndexTip({ x: 1, y: 0.5 }, true)).toEqual({ x: -1, y: 0 });
  });
});

describe('sampleHandVerbs', () => {
  it('emits a pinch rising edge once, then needs an open before re-arming', () => {
    const state = createHandVerbState();
    const close = tips({ x: 0.5, y: 0.5 }, { x: 0.5 + PINCH_ON * 0.5, y: 0.5 });
    const open = tips({ x: 0.5, y: 0.5 }, { x: 0.5 + PINCH_OFF + 0.01, y: 0.5 });

    expect(sampleHandVerbs(state, close, 1_000, { mirror: false }).pinchEdge).toBe(true);
    expect(sampleHandVerbs(state, close, 1_050, { mirror: false }).pinchEdge).toBe(false);

    // Still closed — no edge.
    expect(sampleHandVerbs(state, close, 1_000 + PINCH_REFRACTORY_MS + 10, { mirror: false }).pinchEdge).toBe(false);

    sampleHandVerbs(state, open, 2_000, { mirror: false });
    expect(sampleHandVerbs(state, close, 2_100, { mirror: false }).pinchEdge).toBe(true);
  });

  it('throttles aim posts to the hand budget', () => {
    const state = createHandVerbState();
    const hand = tips({ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 });
    const first = sampleHandVerbs(state, hand, 5_000, { mirror: false });
    expect(first.aim).toEqual(aimFromIndexTip(hand[8]!, false));
    const second = sampleHandVerbs(state, hand, 5_000 + HAND_AIM_MIN_INTERVAL_MS - 1, { mirror: false });
    expect(second.aim).toBeNull();
    const third = sampleHandVerbs(state, hand, 5_000 + HAND_AIM_MIN_INTERVAL_MS, { mirror: false });
    expect(third.aim).not.toBeNull();
  });

  it('treats a missing hand as no verbs', () => {
    const state = createHandVerbState();
    expect(sampleHandVerbs(state, null, 1, { mirror: true })).toEqual({ aim: null, pinchEdge: false });
    expect(sampleHandVerbs(state, [], 1, { mirror: true })).toEqual({ aim: null, pinchEdge: false });
  });
});

describe('pinchDistance', () => {
  it('is zero for coincident tips', () => {
    expect(pinchDistance({ x: 0.2, y: 0.3 }, { x: 0.2, y: 0.3 })).toBe(0);
  });
});
