export interface HowToPlay {
  controls?: Array<{
    keys: string | { en: string; pl: string };
    action: { en: string; pl: string };
  }>;
  goal: { en: string; pl: string };
  scoring?: { en: string; pl: string };
  mode?: { en: string; pl: string };
  hint: { en: string; pl: string };
  sound?: { en: string; pl: string } | false;
  playAgain?: { en: string; pl: string } | false;
  touch?: { en: string; pl: string } | false;
}

function isBilingualString(value: unknown): value is { en: string; pl: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { en?: unknown }).en === 'string' &&
    (value as { en: string }).en.length > 0 &&
    typeof (value as { pl?: unknown }).pl === 'string' &&
    (value as { pl: string }).pl.length > 0
  );
}

// Shared by upload validation, generation, and staged-preview readiness — see docs.
export function hasPlayableHowToPlay(howToPlay: unknown): howToPlay is HowToPlay {
  if (typeof howToPlay !== 'object' || howToPlay === null) return false;
  const candidate = howToPlay as { goal?: unknown; hint?: unknown };
  return isBilingualString(candidate.goal) && isBilingualString(candidate.hint);
}

function isLocalizedPair(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { en?: unknown }).en === 'string' &&
    typeof (value as { pl?: unknown }).pl === 'string'
  );
}

const PAIR = '{"en":"...","pl":"..."}';

// The index.html generator reads each of these as a pair.
const PAIR_FIELDS = ['goal', 'hint', 'scoring', 'mode'] as const;

// These may also be false, which hides the legend row.
const TOGGLE_FIELDS = ['sound', 'playAgain', 'touch'] as const;

// Names the first field the generated page would crash on.
export function howToPlayShapeProblem(howToPlay: unknown): string | null {
  // Presence is hasPlayableHowToPlay's call; this only guards the shape.
  if (typeof howToPlay !== 'object' || howToPlay === null) return null;
  const fields = howToPlay as Record<string, unknown>;
  const where = (path: string, shape: string) =>
    `GAME.json howToPlay.${path} must be ${shape} with both strings present. ` +
    'The platform builds the game page from it and crashes on anything else.';

  // Falsy fields fall back to the default row, like the generator.
  for (const field of PAIR_FIELDS) {
    if (fields[field] && !isLocalizedPair(fields[field])) return where(field, PAIR);
  }
  for (const field of TOGGLE_FIELDS) {
    if (fields[field] && !isLocalizedPair(fields[field])) return where(field, `false or ${PAIR}`);
  }
  if (!fields.controls) return null;
  if (!Array.isArray(fields.controls)) return 'GAME.json howToPlay.controls must be an array.';
  for (const [index, control] of fields.controls.entries()) {
    const entry = typeof control === 'object' && control !== null ? (control as Record<string, unknown>) : {};
    if (!isLocalizedPair(entry.action)) return where(`controls[${index}].action`, PAIR);
    if (typeof entry.keys !== 'string' && !isLocalizedPair(entry.keys)) {
      return where(`controls[${index}].keys`, `a string or ${PAIR}`);
    }
  }
  return null;
}
