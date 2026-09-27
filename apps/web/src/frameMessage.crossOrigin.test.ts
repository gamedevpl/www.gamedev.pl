// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { isFromGameFrame, isGameFrameNavigatedAway } from './frameMessage.js';

// Probing a cross-origin WindowProxy with `in` throws SecurityError in browsers.
function crossOriginWindow(deny: () => never): Window {
  return new Proxy({} as Window, { has: deny, get: deny, getOwnPropertyDescriptor: deny, ownKeys: deny });
}

describe('frame helpers given a cross-origin Window', () => {
  it('never probes its properties', () => {
    const deny = vi.fn(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    const win = crossOriginWindow(deny);
    expect(() => isGameFrameNavigatedAway(win)).not.toThrow();
    expect(isGameFrameNavigatedAway(win)).toBe(false);
    const event = { data: {}, origin: 'null', source: win } as unknown as MessageEvent;
    expect(isFromGameFrame(event, win)).toBe(false);
    expect(deny).not.toHaveBeenCalled();
  });
});
