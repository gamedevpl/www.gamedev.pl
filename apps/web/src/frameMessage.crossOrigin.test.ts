// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isFromGameFrame, isGameFrameNavigatedAway } from './frameMessage.js';

// Probing a cross-origin WindowProxy with `in` throws SecurityError in browsers.
function crossOriginWindow(): Window {
  const deny = () => {
    throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
  };
  return new Proxy({} as Window, { has: deny, get: deny, getOwnPropertyDescriptor: deny, ownKeys: deny });
}

describe('frame helpers given a cross-origin Window', () => {
  it('never probes its properties', () => {
    const win = crossOriginWindow();
    expect(() => isGameFrameNavigatedAway(win)).not.toThrow();
    expect(isGameFrameNavigatedAway(win)).toBe(false);
    const event = { data: {}, origin: 'null', source: win } as unknown as MessageEvent;
    expect(() => isFromGameFrame(event, win)).not.toThrow();
  });
});
