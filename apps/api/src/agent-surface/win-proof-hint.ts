// 2026-11-18: a delivery named "lost" as its objective, unopposed.

import { capturePlanHint } from './capture-plan-hint.js';

type Json = Record<string, unknown>;
type SourceFile = { path: string; content: string };

const LOSS = /^(lost|lose|loss|dead|died|defeat|defeated|fail|failed|game[-_ ]?over)$/i;

function parseObject(files: readonly SourceFile[], path: string): Json | null {
  const file = files.find((entry) => entry.path === path);
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(file.content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Json) : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function scripted(actions: unknown, found: Json[] = []): Json[] {
  if (!Array.isArray(actions)) return found;
  for (const action of actions) {
    if (!isObject(action)) continue;
    for (const kind of ['assert', 'waitFor'] as const) {
      const condition = action[kind];
      if (isObject(condition) && typeof condition.field === 'string') found.push(condition);
    }
    if (isObject(action.repeat)) scripted(action.repeat.actions, found);
  }
  return found;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// True when the capture condition holding means the objective's does.
function implies(capture: Json, objective: Json): boolean {
  if (capture.field !== objective.field) return false;
  if (Array.isArray(capture.oneOf)) {
    const { oneOf, ...rest } = capture;
    return oneOf.length > 0 && oneOf.every((value) => implies({ ...rest, equals: value }, objective));
  }
  if ('equals' in objective) return 'equals' in capture && capture.equals === objective.equals;
  const exact = num(capture.equals);
  const floor = num(objective.atLeast) ?? num(objective.greaterThanOrEqual);
  const ceiling = num(objective.atMost) ?? num(objective.lessThanOrEqual);
  if (floor === null && ceiling === null) return false;
  const low = exact ?? num(capture.greaterThanOrEqual) ?? num(capture.greaterThan);
  const high = exact ?? num(capture.lessThanOrEqual) ?? num(capture.lessThan);
  return (floor === null || (low !== null && low >= floor)) && (ceiling === null || (high !== null && high <= ceiling));
}

// Null when the files show a win, or cannot say.
export function winProofProblem(files: readonly SourceFile[], opts: { firstDelivery: boolean }): string | null {
  // A plan the runner cannot finish stores no frames, on any delivery.
  const plan = files.find((file) => file.path === 'CAPTURE.json');
  const broken = plan ? capturePlanHint(plan.content, { stills: false }) : null;
  if (broken) return `${broken} Fix CAPTURE.json and submit again.`;

  const acceptance = parseObject(files, 'ACCEPTANCE.json');
  const achieved = Array.isArray(acceptance?.achieved) ? acceptance.achieved.filter(isObject) : [];
  if (achieved.length === 0) return null;
  // 2026-11-27: a first delivery without a plan stored no frames.
  if (opts.firstDelivery && !files.some((file) => file.path === 'CAPTURE.json')) {
    return (
      'The delivery has no CAPTURE.json, so the gate stores no frames and nothing shows the game can be won. ' +
      'Stage a CAPTURE.json scripted to the state ACCEPTANCE.json names, then submit again.'
    );
  }

  const loss = achieved.find((condition) => typeof condition.equals === 'string' && LOSS.test(condition.equals));
  if (loss && achieved.every((condition) => typeof condition.equals === 'string' && LOSS.test(condition.equals))) {
    return (
      `ACCEPTANCE.json names a loss as the objective ("${String(loss.field)}" equals "${String(loss.equals)}"). ` +
      'Its achieved conditions describe the player winning; make them the win state, and have CAPTURE.json ' +
      'reach it with the controls a player has. Check the loss with a second replay plan kept out of the delivery.'
    );
  }

  // Older games predate the rule; only first deliveries are held.
  if (!opts.firstDelivery) return null;
  const capture = parseObject(files, 'CAPTURE.json');
  if (!capture || !Array.isArray(capture.script)) return null;
  const conditions = scripted(capture.script);
  if (achieved.some((objective) => conditions.some((condition) => implies(condition, objective)))) return null;
  const named = achieved.map((objective) => objective.field).filter((field) => typeof field === 'string');
  if (named.length === 0) return null;
  return (
    `CAPTURE.json never asserts or waits for a condition ACCEPTANCE.json names (${named.map((field) => `"${String(field)}"`).join(', ')}), ` +
    'so nothing shows the game can be won. Script the capture to that state with the controls a player has ' +
    '(maxFrames up to fps * 120), then submit again.'
  );
}
