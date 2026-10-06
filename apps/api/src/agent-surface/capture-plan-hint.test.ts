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
