// Text a player reads. Code and data never reach a checker.
const PROSE_KEYS = ['title', 'description', 'howToPlay', 'ariaLabel'] as const;

export const MAX_SPEC_CHARS = 4000;
export const MAX_MANIFEST_CHARS = 2000;
const MAX_FIELDS = 40;

function collectStrings(value: unknown, into: string[], budget: { left: number }): void {
  if (into.length >= MAX_FIELDS || budget.left <= 0) return;
  if (typeof value === 'string') {
    const text = value.trim().slice(0, budget.left);
    if (text) {
      into.push(text);
      budget.left -= text.length;
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, into, budget);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) collectStrings(entry, into, budget);
  }
}

function manifestProse(source: string | undefined, into: string[]): void {
  if (!source) return;
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(source) as Record<string, unknown>;
  } catch {
    // An unparseable manifest is the gate's problem, not moderation's.
    return;
  }
  if (!manifest || typeof manifest !== 'object') return;
  const budget = { left: MAX_MANIFEST_CHARS };
  for (const key of PROSE_KEYS) collectStrings(manifest[key], into, budget);
  const canvas = manifest.canvas;
  if (canvas && typeof canvas === 'object') {
    collectStrings((canvas as Record<string, unknown>).ariaLabel, into, budget);
  }
}

// One batched model call carries these, so the total is budgeted.
export function deliveredProseFields(files: readonly { path: string; content: string }[]): string[] {
  const fields: string[] = [];
  const spec = files.find((file) => file.path === 'SPEC.md')?.content?.trim();
  if (spec) fields.push(spec.slice(0, MAX_SPEC_CHARS));
  manifestProse(files.find((file) => file.path === 'GAME.json')?.content, fields);
  return fields.slice(0, MAX_FIELDS);
}
