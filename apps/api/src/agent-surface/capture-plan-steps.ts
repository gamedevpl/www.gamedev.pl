// Per-step rules mirroring Check 8 in games-repo tools/validate.ts.

const KINDS = [
  'capture',
  'wait',
  'tap',
  'press',
  'keyDown',
  'keyUp',
  'click',
  'move',
  'drag',
  'assert',
  'waitFor',
  'repeat',
];
const OPERATORS = ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'oneOf'];
const NUMERIC = ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'];

type Step = Record<string, unknown>;

function isObject(value: unknown): value is Step {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unit(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function pointerProblem(pointer: unknown, label: string): string | null {
  const bad = `${label} needs normalized x/y between 0 and 1 (a share of the canvas, not pixels) or fromMetadata fields`;
  if (!isObject(pointer)) return bad;
  const meta = pointer.fromMetadata;
  const semantic =
    isObject(meta) && typeof meta.x === 'string' && meta.x !== '' && typeof meta.y === 'string' && meta.y !== '';
  return (unit(pointer.x) && unit(pointer.y)) || semantic ? null : bad;
}

function keyed(value: unknown): boolean {
  const key = typeof value === 'string' ? value : isObject(value) ? value.key : undefined;
  return typeof key === 'string' && key !== '';
}

function conditionProblem(condition: unknown, label: string, needsMaxFrames: boolean): string | null {
  if (!isObject(condition) || typeof condition.field !== 'string' || !condition.field) {
    return `${label} needs a metadata field`;
  }
  const operators = OPERATORS.filter((operator) => operator in condition);
  if (operators.length !== 1) return `${label} needs exactly one comparison operator`;
  const operator = operators[0]!;
  if (operator === 'oneOf' && (!Array.isArray(condition.oneOf) || condition.oneOf.length === 0)) {
    return `${label}.oneOf must be a non-empty array`;
  }
  if (NUMERIC.includes(operator) && !Number.isFinite(condition[operator]))
    return `${label}.${operator} must be a number`;
  const maxFrames = condition.maxFrames;
  if (needsMaxFrames && (!Number.isInteger(maxFrames) || (maxFrames as number) < 1)) {
    return `${label} needs a positive maxFrames`;
  }
  return null;
}

function actionProblem(action: Step, depth: number, names: Set<string>): string | null {
  const kinds = KINDS.filter((key) => key in action);
  if (kinds.length !== 1) return `needs exactly one of ${KINDS.join(', ')}`;
  const kind = kinds[0]!;
  const value = action[kind];
  switch (kind) {
    case 'capture':
      if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(value)) return 'capture name must be kebab-case';
      if (names.has(value)) return `duplicate capture name "${value}"`;
      names.add(value);
      return null;
    case 'wait':
      return Number.isInteger(value) && (value as number) >= 1 ? null : 'wait must be a positive frame count';
    case 'tap':
    case 'keyDown':
    case 'keyUp':
      return keyed(value) ? null : `${kind} needs a key`;
    case 'press': {
      const frames = isObject(value) ? value.frames : undefined;
      const ok = isObject(value) && keyed(value) && Number.isInteger(frames) && (frames as number) >= 1;
      return ok ? null : 'press needs { "key": "<key>", "frames": <positive count> }';
    }
    case 'click':
    case 'move':
      return pointerProblem(value, kind);
    case 'drag': {
      if (!isObject(value)) return 'drag must be an object';
      const frames = value.frames;
      const pointer = pointerProblem(value.from, 'drag.from') ?? pointerProblem(value.to, 'drag.to');
      return (
        pointer ?? (Number.isInteger(frames) && (frames as number) >= 1 ? null : 'drag needs a positive frame count')
      );
    }
    case 'assert':
      return conditionProblem(value, 'assert', false);
    case 'waitFor':
      return conditionProblem(value, 'waitFor', true);
    default: {
      const times = isObject(value) ? value.times : undefined;
      if (!isObject(value) || !Number.isInteger(times) || (times as number) < 1 || !Array.isArray(value.actions)) {
        return 'repeat needs positive times and an actions array';
      }
      return stepsProblem(value.actions, depth + 1, names, 'repeat step');
    }
  }
}

// First broken step, numbered from 1; the runner stops there.
export function stepsProblem(actions: unknown[], depth = 0, names = new Set<string>(), label = 'step'): string | null {
  if (depth > 3) return 'repeat nesting is too deep';
  for (const [index, action] of actions.entries()) {
    const problem = isObject(action) ? actionProblem(action, depth, names) : 'must be an object';
    if (problem) return `${label} ${index + 1} (${JSON.stringify(action)}): ${problem}`;
  }
  return null;
}
