import { describe, expect, it } from 'vitest';
import {
  CATCH_Y0,
  CATCH_Y1,
  MASCOT_HALF,
  SPLASH_LIVES,
  createSplashGame,
  fallSpeed,
  nudgeSplashMascot,
  setSplashMascotX,
  spawnInterval,
  tickSplashGame,
  type SplashGameState,
  type SplashSnack,
} from './splashGame.js';

const mid = () => 0.5;

function snack(partial: Partial<SplashSnack> = {}): SplashSnack {
  return { id: 1, x: 0.5, y: 0, vy: 0.4, kind: 0, ...partial };
}

function playing(partial: Partial<SplashGameState> = {}): SplashGameState {
  return { ...createSplashGame(), spawnIn: 99, ...partial };
}

describe('splash snack-catch', () => {
  it('starts centred with three lives and no snacks', () => {
    const state = createSplashGame();
    expect(state.mascotX).toBe(0.5);
    expect(state.lives).toBe(SPLASH_LIVES);
    expect(state.snacks).toEqual([]);
    expect(state.status).toBe('playing');
  });

  it('clamps the mascot so he stays on the stage', () => {
    const state = createSplashGame();
    expect(setSplashMascotX(state, -1).mascotX).toBe(MASCOT_HALF);
    expect(setSplashMascotX(state, 2).mascotX).toBe(1 - MASCOT_HALF);
    expect(nudgeSplashMascot(state, -1).mascotX).toBe(0.4);
    expect(nudgeSplashMascot(state, 1).mascotX).toBe(0.6);
  });

  it('does not move him after the round is over', () => {
    const over = playing({ status: 'over', mascotX: 0.5 });
    expect(setSplashMascotX(over, 0.8).mascotX).toBe(0.5);
  });

  it('catches a snack that falls onto him', () => {
    const state = playing({
      snacks: [snack({ y: CATCH_Y0 - 0.01, vy: 1 })],
    });
    const { state: next, caught, missed } = tickSplashGame(state, 0.03, mid);
    expect(caught).toBe(1);
    expect(missed).toBe(0);
    expect(next.score).toBe(1);
    expect(next.lives).toBe(SPLASH_LIVES);
    expect(next.snacks).toEqual([]);
  });

  it('misses a snack that falls past him', () => {
    const state = playing({
      mascotX: MASCOT_HALF,
      snacks: [snack({ x: 1 - MASCOT_HALF, y: CATCH_Y1 - 0.01, vy: 1 })],
    });
    const { state: next, caught, missed } = tickSplashGame(state, 0.03, mid);
    expect(caught).toBe(0);
    expect(missed).toBe(1);
    expect(next.score).toBe(0);
    expect(next.lives).toBe(SPLASH_LIVES - 1);
  });

  it('ends the round on the third miss', () => {
    const state = playing({
      lives: 1,
      mascotX: MASCOT_HALF,
      snacks: [snack({ x: 1 - MASCOT_HALF, y: CATCH_Y1 - 0.01, vy: 1 })],
    });
    const { state: next } = tickSplashGame(state, 0.03, mid);
    expect(next.status).toBe('over');
    expect(next.lives).toBe(0);
    expect(next.snacks).toEqual([]);
  });

  it('spawns a snack when the timer elapses', () => {
    const state = playing({ spawnIn: 0, snacks: [] });
    const { state: next } = tickSplashGame(state, 0.016, () => 0.25);
    expect(next.snacks).toHaveLength(1);
    expect(next.snacks[0]?.y).toBeLessThan(0);
    expect(next.nextId).toBe(2);
  });

  it('does not tick a finished round', () => {
    const over = playing({ status: 'over', score: 4, snacks: [snack()] });
    const { state: next, caught } = tickSplashGame(over, 1, mid);
    expect(next).toBe(over);
    expect(caught).toBe(0);
  });

  it('ramps speed with score but keeps a floor and a cap', () => {
    expect(spawnInterval(0)).toBeGreaterThan(spawnInterval(20));
    expect(spawnInterval(100)).toBe(0.55);
    expect(fallSpeed(0)).toBeLessThan(fallSpeed(20));
    expect(fallSpeed(100)).toBe(0.72);
  });
});
