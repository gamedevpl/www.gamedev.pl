import { describe, expect, it } from 'vitest';
import { classifyTouchSource } from './catalog-touch.js';

describe('classifyTouchSource', () => {
  it('detects GameKit createInput as gamekit', () => {
    expect(classifyTouchSource('const input = GameKit.createInput(canvas);')).toBe('gamekit');
    expect(classifyTouchSource('GameKit.defineGame().input({ steer: "origin" }).start();')).toBe('gamekit');
  });

  it('treats touch: false + pointer polls as native', () => {
    expect(
      classifyTouchSource('const input = GameKit.createInput(canvas, { touch: false }); input.consumeClick();'),
    ).toBe('native');
    expect(
      classifyTouchSource('const input = GameKit.createInput(canvas, { touch: false }); input.consumeWheel();'),
    ).toBe('none');
    expect(
      classifyTouchSource('const input = GameKit.createInput(canvas, { touch: false }); input.consumePinch();'),
    ).toBe('native');
  });

  it('detects party games as controllers', () => {
    expect(classifyTouchSource('const party = GameKit.createParty(canvas);')).toBe('controllers');
    expect(classifyTouchSource('const p = GameKit.createParty(canvas); const i = GameKit.createInput(canvas);')).toBe(
      'controllers',
    );
  });

  it('returns none for keyboard-only code', () => {
    expect(classifyTouchSource('window.addEventListener("keydown", () => {});')).toBe('none');
  });
});
