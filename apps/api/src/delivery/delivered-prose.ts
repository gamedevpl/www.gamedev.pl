// Text a player reads. Code and data never reach a checker.
const PROSE_KEYS = ['title', 'description', 'howToPlay', 'ariaLabel'] as const;

const MAX_FIELD_CHARS = 4000;
const MAX_FIELDS = 40;

function collectStrings(value: unknown, into: string[]): void {
  if (into.length >= MAX_FIELDS) return;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) into.push(text.slice(0, MAX_FIELD_CHARS));
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, into);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) collectStrings(entry, into);
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
  for (const key of PROSE_KEYS) collectStrings(manifest[key], into);
  const canvas = manifest.canvas;
  if (canvas && typeof canvas === 'object') {
    collectStrings((canvas as Record<string, unknown>).ariaLabel, into);
  }
}

export function deliveredProseFields(files: readonly { path: string; content: string }[]): string[] {
  const fields: string[] = [];
  const spec = files.find((file) => file.path === 'SPEC.md')?.content?.trim();
  if (spec) fields.push(spec.slice(0, MAX_FIELD_CHARS));
  manifestProse(files.find((file) => file.path === 'GAME.json')?.content, fields);
  return fields.slice(0, MAX_FIELDS);
}
