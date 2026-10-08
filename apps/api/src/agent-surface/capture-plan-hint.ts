import { stepsProblem } from './capture-plan-steps.js';

// CAPTURE.json shape check; a bad plan silently stores no stills.

const EXAMPLE = '{ "seed": 42, "fps": 60, "maxFrames": 300, "script": [{ "wait": 60 }, { "capture": "gameplay" }] }';

function countCaptures(actions: unknown[]): number {
  let count = 0;
  for (const action of actions) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) continue;
    const step = action as Record<string, unknown>;
    if (typeof step.capture === 'string' && step.capture.trim()) count += 1;
    const repeat = step.repeat as { actions?: unknown } | undefined;
    if (repeat && Array.isArray(repeat.actions)) count += countCaptures(repeat.actions);
  }
  return count;
}

export function capturePlanHint(content: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return `CAPTURE.json is not valid JSON (${error instanceof Error ? error.message : String(error)}). Expected a capture plan like ${EXAMPLE}.`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return `CAPTURE.json must be a JSON object: a capture plan like ${EXAMPLE}.`;
  }
  const plan = parsed as Record<string, unknown>;
  const missing = (['seed', 'fps', 'maxFrames'] as const).filter((key) => !Number.isInteger(plan[key]));
  if (!Array.isArray(plan.script) || missing.length > 0) {
    const problems = [...(Array.isArray(plan.script) ? [] : ['script']), ...missing].join(', ');
    return (
      `CAPTURE.json is not a capture plan (missing or invalid: ${problems}). The capture runner executes ` +
      `"script" step by step, so this file stores no screenshots — no gate stills and no concept proposal ` +
      `for the creator. Use this shape: ${EXAMPLE}. Steps: wait, press, tap, keyDown, keyUp, click, move, ` +
      `drag, assert, waitFor, repeat, capture.`
    );
  }
  const broken = stepsProblem(plan.script);
  if (broken) {
    return (
      `CAPTURE.json ${broken}. The capture runner stops at the first bad step, so the gate stores no ` +
      `screenshot and the creator gets no concept proposal. Fix that step; a minimal plan is ${EXAMPLE}.`
    );
  }
  if (countCaptures(plan.script) === 0) {
    return (
      'CAPTURE.json has no { "capture": "<name>" } step, so the gate stores no screenshot and the creator ' +
      `gets no concept proposal. Add one once the game shows play with its HUD, e.g. ${EXAMPLE}.`
    );
  }
  return null;
}
