import { describe, expect, it } from 'vitest';
import { capturePlanHint } from './capture-plan-hint.js';
import { stagedFileHint } from './staged-file-hint.js';

const plan = (script: unknown[]) => JSON.stringify({ seed: 42, fps: 60, maxFrames: 300, script });

describe('capturePlanHint', () => {
  it('accepts a plan with a capture step, nested or not', () => {
    expect(capturePlanHint(plan([{ wait: 60 }, { capture: 'gameplay' }]))).toBeNull();
    expect(capturePlanHint(plan([{ repeat: { times: 2, actions: [{ capture: 'loop' }] } }]))).toBeNull();
  });

  it('flags the invented shape a builder wrote in production', () => {
    const invented = JSON.stringify({
      title: 'Trenchline Command',
      viewport: { width: 640, height: 400 },
      controls: [{ action: 'select squad', input: 'click' }],
      visualChecks: ['Trench lines are visible.'],
    });
    const hint = capturePlanHint(invented);
    expect(hint).toMatch(/not a capture plan \(missing or invalid: script, seed, fps, maxFrames\)/);
    expect(hint).toContain('"script": [{ "wait": 60 }, { "capture": "gameplay" }]');
  });

  it('flags pixel clicks, the second plan a builder wrote in production', () => {
    const pixels = plan([{ wait: 30 }, { click: { x: 180, y: 145 } }, { press: 'q' }, { capture: 'gameplay' }]);
    expect(capturePlanHint(pixels)).toMatch(/step 2 \(\{"click":\{"x":180,"y":145\}\}\): click needs normalized x\/y/);
    const press = plan([{ wait: 30 }, { press: 'q' }, { capture: 'gameplay' }]);
    expect(capturePlanHint(press)).toMatch(/step 2 .*press needs \{ "key"/);
  });

  it('accepts every step kind in a valid shape', () => {
    const steps = [
      { wait: 2 },
      { tap: 'Space' },
      { press: { key: 'ArrowUp', frames: 10 } },
      { keyDown: { key: 'Shift' } },
      { keyUp: 'Shift' },
      { click: { x: 0.25, y: 0.5 } },
      { move: { fromMetadata: { x: 'playerX', y: 'playerY' } } },
      { drag: { from: { x: 0.1, y: 0.1 }, to: { x: 0.9, y: 0.9 }, frames: 5 } },
      { assert: { field: 'state', equals: 'playing' } },
      { waitFor: { field: 'score', greaterThan: 0, maxFrames: 60 } },
      { repeat: { times: 2, actions: [{ wait: 1 }] } },
      { capture: 'gameplay' },
    ];
    expect(capturePlanHint(plan(steps))).toBeNull();
  });

  it('flags a broken step nested in a repeat and a duplicate capture name', () => {
    expect(capturePlanHint(plan([{ repeat: { times: 2, actions: [{ wait: 0 }] } }, { capture: 'a' }]))).toMatch(
      /repeat step 1 .*wait must be a positive frame count/,
    );
    expect(capturePlanHint(plan([{ capture: 'a' }, { capture: 'a' }]))).toMatch(/duplicate capture name "a"/);
  });

  it('flags a plan that never captures', () => {
    expect(capturePlanHint(plan([{ wait: 60 }, { press: { key: 'ArrowUp', frames: 10 } }]))).toMatch(
      /no \{ "capture": "<name>" \} step/,
    );
  });

  it('flags invalid JSON and non-objects', () => {
    expect(capturePlanHint('{ nope')).toMatch(/not valid JSON/);
    expect(capturePlanHint('[]')).toMatch(/must be a JSON object/);
  });

  it('is what stagedFileHint answers for CAPTURE.json', () => {
    expect(stagedFileHint('CAPTURE.json', '{}')).toMatch(/not a capture plan/);
    expect(stagedFileHint('CAPTURE.json', plan([{ capture: 'a' }]))).toBeNull();
  });
});
