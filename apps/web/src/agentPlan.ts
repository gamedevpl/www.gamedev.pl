// The CAPTURE.json plan language, as the page accepts it.

// Mirrors capture-plan.ts; see docs/agent-play-mode.md.

import { AGENT_MAX_FRAMES, type AgentCommand, type AgentPointer } from './agentPlay.js';

export type PlanValue = string | number | boolean | null;

export type PlanCondition = {
  field: string;
  equals?: PlanValue;
  notEquals?: PlanValue;
  greaterThan?: number;
  greaterThanOrEqual?: number;
  lessThan?: number;
  lessThanOrEqual?: number;
  oneOf?: PlanValue[];
  // Only meaningful on waitFor.
  maxFrames?: number;
};

export type PlanKey = string | { key: string; code?: string };

export type PlanAction =
  | { capture: string }
  | { wait: number }
  | { tap: PlanKey }
  | { press: { key: string; code?: string; frames: number } }
  | { keyDown: PlanKey }
  | { keyUp: PlanKey }
  | { click: AgentPointer }
  | { move: AgentPointer }
  | { drag: { from: AgentPointer; to: AgentPointer; frames?: number } }
  | { assert: PlanCondition }
  | { waitFor: PlanCondition }
  | { repeat: { times: number; actions: PlanAction[] } };

export type AgentPlan = {
  fps: number;
  maxFrames: number;
  script: PlanAction[];
};

// The games repo's 120-second play window, honoured here too.
export const PLAY_WINDOW_SECONDS = 120;
// Bounds one `repeat`, so a plan cannot expand into millions of actions.
export const MAX_REPEAT_TIMES = 500;
// Bounds the flattened script, so validation cannot itself hang.
export const MAX_ACTIONS = 2000;

export class PlanError extends Error {}

function fail(message: string): never {
  throw new PlanError(message);
}

function readKey(value: unknown, label: string): { key: string; code: string } {
  if (typeof value === 'string' && value) return { key: value, code: value };
  if (value && typeof value === 'object') {
    const entry = value as { key?: unknown; code?: unknown };
    if (typeof entry.key === 'string' && entry.key) {
      return { key: entry.key, code: typeof entry.code === 'string' && entry.code ? entry.code : entry.key };
    }
  }
  return fail(`${label} needs a key name`);
}

function readPointer(value: unknown, label: string): AgentPointer {
  const point = value as { x?: unknown; y?: unknown } | null;
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return fail(`${label} needs x and y in 0..1`);
  }
  return { x, y };
}

function readFrames(value: unknown, label: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const frames = Number(value);
  if (!Number.isInteger(frames) || frames < 1) return fail(`${label} needs a positive whole number of frames`);
  if (frames > AGENT_MAX_FRAMES) return fail(`${label} may not exceed ${AGENT_MAX_FRAMES} frames`);
  return frames;
}

const OPERATORS = ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'oneOf'];

function readCondition(value: unknown, label: string): PlanCondition {
  if (!value || typeof value !== 'object') return fail(`${label} needs a condition object`);
  const raw = value as Record<string, unknown>;
  if (typeof raw.field !== 'string' || !raw.field) return fail(`${label} needs a snapshot field name`);
  const used = OPERATORS.filter((name) => raw[name] !== undefined);
  if (used.length === 0) return fail(`${label} needs one of: ${OPERATORS.join(', ')}`);
  if (used.length > 1) return fail(`${label} may use one operator, not ${used.length}`);
  if (raw.oneOf !== undefined && !Array.isArray(raw.oneOf)) return fail(`${label} oneOf needs a list`);
  const condition: PlanCondition = { field: raw.field };
  for (const name of used) (condition as Record<string, unknown>)[name] = raw[name];
  if (raw.maxFrames !== undefined) condition.maxFrames = readFrames(raw.maxFrames, `${label} maxFrames`);
  return condition;
}

function readAction(value: unknown, label: string, depth: number): PlanAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${label} must be an object`);
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return fail(`${label} must name exactly one action, saw ${keys.length}`);
  const kind = keys[0]!;

  if (kind === 'capture') {
    if (typeof raw.capture !== 'string' || !raw.capture) return fail(`${label} capture needs a name`);
    return { capture: raw.capture.slice(0, 60) };
  }
  if (kind === 'wait') return { wait: readFrames(raw.wait, `${label} wait`) };
  if (kind === 'tap') return { tap: readKey(raw.tap, `${label} tap`) };
  if (kind === 'keyDown') return { keyDown: readKey(raw.keyDown, `${label} keyDown`) };
  if (kind === 'keyUp') return { keyUp: readKey(raw.keyUp, `${label} keyUp`) };
  if (kind === 'press') {
    const press = raw.press as { key?: unknown; code?: unknown; frames?: unknown } | null;
    const resolved = readKey(press, `${label} press`);
    return { press: { ...resolved, frames: readFrames(press?.frames, `${label} press`, 1) } };
  }
  if (kind === 'click') return { click: readPointer(raw.click, `${label} click`) };
  if (kind === 'move') return { move: readPointer(raw.move, `${label} move`) };
  if (kind === 'drag') {
    const drag = raw.drag as { from?: unknown; to?: unknown; frames?: unknown } | null;
    return {
      drag: {
        from: readPointer(drag?.from, `${label} drag.from`),
        to: readPointer(drag?.to, `${label} drag.to`),
        frames: readFrames(drag?.frames, `${label} drag`, 1),
      },
    };
  }
  if (kind === 'assert') return { assert: readCondition(raw.assert, `${label} assert`) };
  if (kind === 'waitFor') return { waitFor: readCondition(raw.waitFor, `${label} waitFor`) };
  if (kind === 'repeat') {
    if (depth >= 3) return fail(`${label} repeat is nested too deeply`);
    const repeat = raw.repeat as { times?: unknown; actions?: unknown } | null;
    const times = Number(repeat?.times);
    if (!Number.isInteger(times) || times < 1 || times > MAX_REPEAT_TIMES) {
      return fail(`${label} repeat.times must be a whole number between 1 and ${MAX_REPEAT_TIMES}`);
    }
    if (!Array.isArray(repeat?.actions) || repeat.actions.length === 0) {
      return fail(`${label} repeat needs actions`);
    }
    return {
      repeat: {
        times,
        actions: repeat.actions.map((entry, index) => readAction(entry, `${label} repeat[${index}]`, depth + 1)),
      },
    };
  }
  return fail(`${label} names an unknown action: ${kind}`);
}

function countActions(actions: PlanAction[]): number {
  let total = 0;
  for (const action of actions) {
    total += 1;
    if ('repeat' in action) total += action.repeat.times * countActions(action.repeat.actions);
    if (total > MAX_ACTIONS) return total;
  }
  return total;
}

// Accepts what the games repo writes; `seed` and `film` are ignored.
export function parseAgentPlan(text: string): AgentPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('the plan is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('the plan must be a JSON object');
  const raw = parsed as Record<string, unknown>;

  const fps = raw.fps === undefined ? 30 : Number(raw.fps);
  if (!Number.isFinite(fps) || fps < 1 || fps > 240) return fail('fps must be between 1 and 240');

  const frameCeiling = Math.round(fps * PLAY_WINDOW_SECONDS);
  const maxFrames = raw.maxFrames === undefined ? frameCeiling : Number(raw.maxFrames);
  if (!Number.isInteger(maxFrames) || maxFrames < 1) return fail('maxFrames must be a positive whole number');
  if (maxFrames > frameCeiling)
    return fail(`maxFrames may not exceed ${frameCeiling} (${PLAY_WINDOW_SECONDS}s at ${fps}fps)`);

  if (!Array.isArray(raw.script) || raw.script.length === 0) return fail('the plan needs a non-empty script');
  const script = raw.script.map((entry, index) => readAction(entry, `script[${index}]`, 0));
  if (countActions(script) > MAX_ACTIONS) return fail(`the plan expands past ${MAX_ACTIONS} actions`);

  return { fps: Math.round(fps), maxFrames, script };
}

export type PlanSnapshot = Record<string, PlanValue>;

// A missing field satisfies nothing: absent is not equal.
export function evaluateCondition(condition: PlanCondition, snapshot: PlanSnapshot): boolean {
  const value = snapshot[condition.field];
  if (value === undefined) return false;
  if (condition.equals !== undefined) return value === condition.equals;
  if (condition.notEquals !== undefined) return value !== condition.notEquals;
  if (condition.oneOf !== undefined) return condition.oneOf.includes(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  if (condition.greaterThan !== undefined) return numeric > condition.greaterThan;
  if (condition.greaterThanOrEqual !== undefined) return numeric >= condition.greaterThanOrEqual;
  if (condition.lessThan !== undefined) return numeric < condition.lessThan;
  if (condition.lessThanOrEqual !== undefined) return numeric <= condition.lessThanOrEqual;
  return false;
}

export function describeCondition(condition: PlanCondition): string {
  for (const name of OPERATORS) {
    const value = (condition as Record<string, unknown>)[name];
    if (value !== undefined) return `${condition.field} ${name} ${JSON.stringify(value)}`;
  }
  return condition.field;
}

// Input actions become commands; the runner keeps the rest.
export function commandForAction(action: PlanAction): AgentCommand | null {
  if ('wait' in action) return { kind: 'step', frames: action.wait };
  if ('tap' in action) return { kind: 'tap', ...(action.tap as { key: string; code: string }) };
  if ('keyDown' in action) return { kind: 'keyDown', ...(action.keyDown as { key: string; code: string }) };
  if ('keyUp' in action) return { kind: 'keyUp', ...(action.keyUp as { key: string; code: string }) };
  if ('press' in action) {
    return {
      kind: 'press',
      key: action.press.key,
      code: action.press.code ?? action.press.key,
      frames: action.press.frames,
    };
  }
  if ('click' in action) return { kind: 'click', x: action.click.x, y: action.click.y };
  if ('move' in action) return { kind: 'move', x: action.move.x, y: action.move.y };
  if ('drag' in action) {
    return { kind: 'drag', from: action.drag.from, to: action.drag.to, frames: action.drag.frames ?? 1 };
  }
  return null;
}
