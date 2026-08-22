import { describe, expect, it } from 'vitest';
import { MAX_GAME_SAVE_BYTES, MAX_MULTIPLAYER_SLOTS, MAX_SHOT_BYTES, MAX_TITLE_LENGTH } from './game-limits.js';

describe('game limits', () => {
  it('pins the budgets both sides enforce', () => {
    expect(MAX_GAME_SAVE_BYTES).toBe(32 * 1024);
    expect(MAX_TITLE_LENGTH).toBe(80);
    expect(MAX_MULTIPLAYER_SLOTS).toBe(8);
    expect(MAX_SHOT_BYTES).toBe(300 * 1024);
  });
});
