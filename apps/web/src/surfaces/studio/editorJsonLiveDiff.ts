/**
 * Recognises the one `EDITOR.json` edit that can push live instead of
 * rebuilding: a declared param's `default` changing, nothing else (§E tier 1).
 * Anything shape-changing — added/removed param, type/range/label, content — still
 * needs the normal staged rebuild.
 */

export type DeclaredParamChange = { key: string; value: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => deepEqual(entry, b[index]));
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

/** Mirrors editor-contract.ts's `valueProblem` — what the L4 validator would refuse. */
function defaultSatisfiesSpec(spec: Record<string, unknown>, value: unknown): boolean {
  if (spec.type === 'text') return typeof value === 'string' && value.length <= (spec.max as number);
  if (spec.type === 'int') {
    return (
      Number.isInteger(value) && (value as number) >= (spec.min as number) && (value as number) <= (spec.max as number)
    );
  }
  if (spec.type === 'number') {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= (spec.min as number) &&
      value <= (spec.max as number)
    );
  }
  if (spec.type === 'enum')
    return typeof value === 'string' && Array.isArray(spec.values) && spec.values.includes(value);
  return typeof value === 'boolean';
}

/** `null` means fall back to a staged rebuild; otherwise the changed param keys. */
export function declaredParamDefaultChanges(prevText: string, nextText: string): DeclaredParamChange[] | null {
  let prev: unknown;
  let next: unknown;
  try {
    prev = JSON.parse(prevText);
    next = JSON.parse(nextText);
  } catch {
    return null;
  }
  if (!isPlainObject(prev) || !isPlainObject(next)) return null;

  const { params: prevParams, ...prevRest } = prev;
  const { params: nextParams, ...nextRest } = next;
  // Anything outside `params` changing is a shape change, not a value tweak.
  if (!deepEqual(prevRest, nextRest)) return null;
  if (!isPlainObject(prevParams) || !isPlainObject(nextParams)) return null;

  const prevKeys = Object.keys(prevParams);
  const nextKeys = Object.keys(nextParams);
  if (prevKeys.length !== nextKeys.length || !prevKeys.every((key) => nextKeys.includes(key))) return null;

  const changes: DeclaredParamChange[] = [];
  for (const key of prevKeys) {
    const prevSpec = prevParams[key];
    const nextSpec = nextParams[key];
    if (!isPlainObject(prevSpec) || !isPlainObject(nextSpec)) return null;
    const { default: prevDefault, ...prevSpecRest } = prevSpec;
    const { default: nextDefault, ...nextSpecRest } = nextSpec;
    // A type/min/max/label change needs the L4 validator, not a live push.
    if (!deepEqual(prevSpecRest, nextSpecRest)) return null;
    if (deepEqual(prevDefault, nextDefault)) continue;
    // An out-of-range default is refused at declaration time, not discovered live.
    if (!defaultSatisfiesSpec(nextSpecRest, nextDefault)) return null;
    changes.push({ key, value: nextDefault });
  }
  return changes.length > 0 ? changes : null;
}
