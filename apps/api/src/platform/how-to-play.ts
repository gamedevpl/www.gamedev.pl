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
