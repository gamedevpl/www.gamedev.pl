import { describe, expect, it } from 'vitest';
import {
  commandForAction,
  describeCondition,
  evaluateCondition,
  MAX_REPEAT_TIMES,
  parseAgentPlan,
  PLAY_WINDOW_SECONDS,
} from './agentPlan.js';

const plan = (body: Record<string, unknown>) => parseAgentPlan(JSON.stringify(body));

describe('parseAgentPlan', () => {
  it('reads a plan of the shape the games repo commits', () => {
    const parsed = plan({
      seed: 7,
      fps: 30,
      maxFrames: 600,
      script: [
        { tap: 'Enter' },
        { waitFor: { field: 'state', equals: 'playing', maxFrames: 120 } },
        { capture: 'round-start' },
        { repeat: { times: 2, actions: [{ press: { key: 'ArrowRight', frames: 20 } }, { wait: 5 }] } },
        { assert: { field: 'score', greaterThan: 0 } },
      ],
    });

    expect(parsed.fps).toBe(30);
    expect(parsed.maxFrames).toBe(600);
    expect(parsed.script).toHaveLength(5);
    // `seed` is accepted and dropped: no record comes from this surface.
    expect(parsed as unknown as { seed?: number }).not.toHaveProperty('seed');
  });

  it('defaults the two numbers a hand-written plan usually omits', () => {
    const parsed = plan({ script: [{ wait: 1 }] });
    expect(parsed.fps).toBe(30);
    expect(parsed.maxFrames).toBe(30 * PLAY_WINDOW_SECONDS);
  });

  it('normalizes a key given either way round', () => {
    expect(plan({ script: [{ tap: 'Enter' }] }).script[0]).toEqual({ tap: { key: 'Enter', code: 'Enter' } });
    expect(plan({ script: [{ tap: { key: ' ', code: 'Space' } }] }).script[0]).toEqual({
      tap: { key: ' ', code: 'Space' },
    });
  });

  it('refuses a plan that could not be honoured', () => {
    expect(() => parseAgentPlan('not json')).toThrow(/valid JSON/);
    expect(() => plan({ script: [] })).toThrow(/non-empty script/);
    expect(() => plan({ fps: 30, maxFrames: 30 * PLAY_WINDOW_SECONDS + 1, script: [{ wait: 1 }] })).toThrow(
      /may not exceed/,
    );
    expect(() => plan({ script: [{ wait: 0 }] })).toThrow(/positive whole number/);
    expect(() => plan({ script: [{ click: { x: 2, y: 0 } }] })).toThrow(/0\.\.1/);
    expect(() => plan({ script: [{ teleport: 1 }] })).toThrow(/unknown action/);
    expect(() => plan({ script: [{ wait: 1, tap: 'Enter' }] })).toThrow(/exactly one action/);
    expect(() => plan({ script: [{ assert: { field: 'score' } }] })).toThrow(/needs one of/);
    expect(() => plan({ script: [{ assert: { field: 'score', equals: 1, lessThan: 2 } }] })).toThrow(/one operator/);
    expect(() => plan({ script: [{ repeat: { times: MAX_REPEAT_TIMES + 1, actions: [{ wait: 1 }] } }] })).toThrow(
      /between 1 and/,
    );
  });

  it('refuses a plan that expands into an unreasonable number of actions', () => {
    const inner = { repeat: { times: 500, actions: [{ wait: 1 }] } };
    expect(() => plan({ script: [{ repeat: { times: 500, actions: [inner] } }] })).toThrow(/expands past/);
  });
});

describe('evaluateCondition', () => {
  const snapshot = { state: 'playing', score: 12, lives: 0 };

  it('reads the operators the games repo defines', () => {
    expect(evaluateCondition({ field: 'state', equals: 'playing' }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: 'state', notEquals: 'playing' }, snapshot)).toBe(false);
    expect(evaluateCondition({ field: 'score', greaterThan: 10 }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: 'score', greaterThanOrEqual: 12 }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: 'lives', lessThan: 1 }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: 'lives', lessThanOrEqual: 0 }, snapshot)).toBe(true);
    expect(evaluateCondition({ field: 'state', oneOf: ['won', 'lost'] }, snapshot)).toBe(false);
  });

  it('never satisfies a condition on a field the game does not report', () => {
    // An absent field reads as unknown, never as zero.
    expect(evaluateCondition({ field: 'targetWord', equals: 'HORSE' }, snapshot)).toBe(false);
    expect(evaluateCondition({ field: 'targetWord', lessThan: 99 }, snapshot)).toBe(false);
  });

  it('describes itself the way the panel prints it', () => {
    expect(describeCondition({ field: 'score', greaterThan: 3 })).toBe('score greaterThan 3');
  });
});

describe('commandForAction', () => {
  it('turns input actions into bridge commands', () => {
    expect(commandForAction({ wait: 4 })).toEqual({ kind: 'step', frames: 4 });
    expect(commandForAction({ press: { key: 'ArrowUp', code: 'ArrowUp', frames: 3 } })).toEqual({
      kind: 'press',
      key: 'ArrowUp',
      code: 'ArrowUp',
      frames: 3,
    });
    expect(commandForAction({ click: { x: 0.5, y: 0.5 } })).toEqual({ kind: 'click', x: 0.5, y: 0.5 });
  });

  it("keeps the runner's own actions away from the frame", () => {
    expect(commandForAction({ capture: 'x' })).toBeNull();
    expect(commandForAction({ assert: { field: 'score', greaterThan: 0 } })).toBeNull();
    expect(commandForAction({ waitFor: { field: 'state', equals: 'won' } })).toBeNull();
  });
});
