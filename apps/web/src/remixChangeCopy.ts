import type { EditorParamSpec, EditorParamValue } from './studioApi.js';

function fmt(value: EditorParamValue | undefined): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (value === undefined) return '—';
  return String(value);
}

function specName(spec: EditorParamSpec | undefined, key: string, lang: string): string {
  if (!spec?.label) return key;
  return lang.startsWith('pl') ? spec.label.pl : spec.label.en;
}

// Labels for values that actually moved.
export function describeParamChanges(
  specs: Record<string, EditorParamSpec> | null | undefined,
  before: Record<string, EditorParamValue>,
  after: Record<string, EditorParamValue>,
  lang: string,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const lines: string[] = [];
  for (const key of keys) {
    if (before[key] === after[key]) continue;
    lines.push(`${specName(specs?.[key], key, lang)}: ${fmt(before[key])} → ${fmt(after[key])}`);
  }
  return lines;
}

export function composeRemixOutcome(summary: string, changes: string[]): string {
  if (changes.length === 0) return summary;
  return `${summary}\n${changes.join('\n')}`;
}
