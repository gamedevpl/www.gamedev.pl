import { expect, it } from 'vitest';
import { evaluateCondition, runCapturePlan, type CapturePlan, type PlanDriver } from './capture-plan-runtime.js';

const conformancePlan: CapturePlan = {
  seed: 42,
  fps: 30,
  maxFrames: 20,
  script: [
    { keyDown: { key: 'Shift', code: 'ShiftLeft' } },
    { move: { x: 0.1, y: 0.2 } },
    { drag: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, frames: 2 } },
    { keyUp: { key: 'Shift', code: 'ShiftLeft' } },
    { tap: 'a' },
    { press: { key: 'b', frames: 2 } },
    { click: { fromMetadata: { x: 'targetX', y: 'targetY' } } },
    { repeat: { times: 2, actions: [{ wait: 1 }, { capture: 'repeated' }] } },
    { assert: { field: 'frame', equals: 8 } },
    { waitFor: { field: 'frame', greaterThanOrEqual: 10, maxFrames: 4 } },
    { capture: 'end' },
  ],
};

function conformanceDriver() {
  let frame = 0;
  const events: unknown[] = [];
  const driver: PlanDriver = {
    step(next) {
      frame = next;
      events.push(['step', next]);
    },
    key(...args) {
      events.push(['key', ...args]);
    },
    resolvePointer(target) {
      return target.fromMetadata ? { x: 0.5, y: 0.75 } : { x: target.x!, y: target.y! };
    },
    pointer(...args) {
      events.push(['pointer', ...args]);
    },
    snapshot() {
      return { frame };
    },
    mark(name, at) {
      events.push(['mark', name, at]);
    },
  };
  return { driver, events };
}

it('keeps Creator Kit action ordering, held keys, drag interpolation and frame accounting', async () => {
  const { driver, events } = conformanceDriver();
  expect(await runCapturePlan(conformancePlan, driver)).toEqual({ frames: 10 });
  expect(events).toEqual([
    ['key', 'keydown', 'Shift', 'ShiftLeft'],
    ['pointer', 'pointermove', { x: 0.1, y: 0.2 }, 0],
    ['pointer', 'pointerdown', { x: 0, y: 0 }, 1],
    ['pointer', 'pointermove', { x: 0.5, y: 0.5 }, 1],
    ['step', 1],
    ['pointer', 'pointermove', { x: 1, y: 1 }, 1],
    ['step', 2],
    ['pointer', 'pointerup', { x: 1, y: 1 }, 0],
    ['key', 'keyup', 'Shift', 'ShiftLeft'],
    ['key', 'keydown', 'a', undefined],
    ['step', 3],
    ['key', 'keyup', 'a', undefined],
    ['key', 'keydown', 'b', undefined],
    ['step', 4],
    ['step', 5],
    ['key', 'keyup', 'b', undefined],
    ['pointer', 'pointerdown', { x: 0.5, y: 0.75 }, 1, true],
    ['pointer', 'pointerup', { x: 0.5, y: 0.75 }, 0],
    ['step', 6],
    ['step', 7],
    ['mark', 'repeated', 7],
    ['step', 8],
    ['mark', 'repeated', 8],
    ['step', 9],
    ['step', 10],
    ['mark', 'end', 10],
  ]);
});

it('retains strict Creator Kit condition types, null values and missing-field semantics', () => {
  expect(evaluateCondition({ score: '2' }, { field: 'score', greaterThan: 1 })).toBe(false);
  expect(evaluateCondition({ score: 2 }, { field: 'score', greaterThan: 1 })).toBe(true);
  expect(evaluateCondition({ value: null }, { field: 'value', equals: null })).toBe(true);
  expect(evaluateCondition({}, { field: 'missing', notEquals: 1 })).toBe(true);
  expect(evaluateCondition({ value: false }, { field: 'value', oneOf: [false, null] })).toBe(true);
});
