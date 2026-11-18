// 2026-11-18: a delivery named "lost" as its objective, unopposed.

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

function scriptedFields(actions: unknown, fields: Set<string>): Set<string> {
  if (!Array.isArray(actions)) return fields;
  for (const action of actions) {
    if (!isObject(action)) continue;
    for (const kind of ['assert', 'waitFor'] as const) {
      const condition = action[kind];
      if (isObject(condition) && typeof condition.field === 'string') fields.add(condition.field);
    }
    if (isObject(action.repeat)) scriptedFields(action.repeat.actions, fields);
  }
  return fields;
}

// Null when the files show a win, or cannot say.
export function winProofProblem(files: readonly SourceFile[], opts: { firstDelivery: boolean }): string | null {
  const acceptance = parseObject(files, 'ACCEPTANCE.json');
  const achieved = Array.isArray(acceptance?.achieved) ? acceptance.achieved.filter(isObject) : [];
  if (achieved.length === 0) return null;

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
  const scripted = scriptedFields(capture.script, new Set<string>());
  const named = achieved.map((condition) => condition.field).filter((field) => typeof field === 'string');
  if (named.length === 0 || named.some((field) => scripted.has(field as string))) return null;
  return (
    `CAPTURE.json never asserts or waits for the win ACCEPTANCE.json names (${named.map((field) => `"${String(field)}"`).join(', ')}), ` +
    'so nothing shows the game can be won. Script the capture to that state with the controls a player has ' +
    '(maxFrames up to fps * 120), then submit again.'
  );
}
