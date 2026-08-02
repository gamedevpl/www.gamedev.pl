import { describe, expect, it } from 'vitest';
import { classifyTouchSource } from './catalog-touch.js';

describe('classifyTouchSource', () => {
  it('detects GameKit createInput as gamekit', () => {
    expect(classifyTouchSource('const input = GameKit.createInput(canvas);')).toBe('gamekit');
  });

  it('detects defineGame as gamekit', () => {
    expect(classifyTouchSource('GameKit.defineGame().input({ steer: "origin" }).start();')).toBe('gamekit');
  });

  it('treats touch: false + pointer polls as native', () => {
    expect(
      classifyTouchSource(`
        const input = GameKit.createInput(canvas, { touch: false });
        input.consumeClick();
      `),
    ).toBe('native');
  });

  it('detects party games as controllers', () => {
    expect(classifyTouchSource('const party = GameKit.createParty(canvas);')).toBe('controllers');
  });

  it('returns none for keyboard-only code', () => {
    expect(classifyTouchSource('window.addEventListener("keydown", () => {});')).toBe('none');
  });
});
