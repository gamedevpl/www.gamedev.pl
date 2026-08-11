/**
 * Recognises the one class of `EDITOR.json` edit the Code surface can push
 * straight to the running game instead of queuing a rebuild — a declared
 * param's `default` value changing, and nothing else (realtime-game-editing-
 * plan.md §E, tier 1). Everything else — a new/removed param, a type/range/
 * label change, a collection edit, invalid JSON — still needs the normal
 * staged rebuild, because it changes the *shape* the running game was booted
 * with, not just a value it reads at use-time.
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

/**
 * `null` means "not a live-pushable edit — fall back to the normal staged
 * rebuild flow". A non-null, non-empty array is the set of param keys whose
 * `default` actually changed value, ready to merge into the content document
 * and push over the `editor:content` bridge.
 */
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
  // Everything outside `params` — `content`, `version`, any future top-level
  // key — must be untouched, or this is a shape change the game was not
  // booted to handle.
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
    // A type/min/max/label change is a declaration change, not a value tweak —
    // it needs Check 31 / the L4 validator, not a live push.
    if (!deepEqual(prevSpecRest, nextSpecRest)) return null;
    if (!deepEqual(prevDefault, nextDefault)) changes.push({ key, value: nextDefault });
  }
  return changes.length > 0 ? changes : null;
}
