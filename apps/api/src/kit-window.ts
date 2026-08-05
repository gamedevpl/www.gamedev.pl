/**
 * Creator Kit support window — same-major semver, with N / N−1 as the floor.
 *
 * The registry document is the only authority for which engine refs a delivery may
 * claim. Do not infer previous from git parents (the packer is path-filtered, so a
 * parent commit usually is not the previous kit) or from bucket listing order
 * (undefined). BY-10 owns the publisher; this module is the consumer rule the gate
 * and delivery path share.
 *
 * ## Why counting commits was the wrong measure
 *
 * N/N−1 measures *our merge rate*, not the creator's elapsed time. On 2026-08-05 the
 * games repo published seven kits in ten hours, so a `get_kit` answer was good for
 * 45–90 minutes mid-day: an agent that fetched a ref, wrote code and submitted was
 * routinely two generations behind by the time the gate looked, and three consecutive
 * rounds were refused that way. One was spent on a commit that added an internal probe
 * script — a file no creator ever calls, costing a delivery all the same.
 *
 * Almost none of those merges could have broken a game, which is the point: commit
 * count was never a proxy for compatibility. The kit now declares a semver
 * (`shared/kit-version.json` in the games repo) and the gate accepts **any kit sharing
 * the current major**.
 *
 * What makes the declaration trustworthy is not discipline but CI: the games repo
 * typechecks its whole catalog against the engine on every push to main, so a change
 * that breaks the engine's surface cannot land without its author also fixing every
 * game — which is exactly the situation that warrants a major.
 *
 * N/N−1 remains the floor for kits published before versions existed, so this is
 * strictly a widening: nothing accepted before is refused now.
 */

export type KitRegistry = {
  current: string;
  previous: string | null;
  /** Semver of `current`. Absent on documents written before versioning shipped. */
  currentVersion?: string;
  updatedAt: string;
};

/** Major component of a semver string, or null when it is not one. */
export function semverMajor(version: string | null | undefined): number | null {
  if (typeof version !== 'string') return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) return null;
  return Number(match[1]);
}

export const KIT_REGISTRY_OBJECT = 'kits/current.json';

export function parseKitRegistry(raw: string): KitRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('kits/current.json is not valid JSON', { cause: error });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('kits/current.json must be an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.current !== 'string' || !obj.current) {
    throw new Error('kits/current.json.current must be a non-empty string');
  }
  // Empty string is not "no previous" — null is. Accepting "" would shrink the window
  // silently and produce confusing kit_outdated reports.
  if (!(obj.previous === null || (typeof obj.previous === 'string' && obj.previous.length > 0))) {
    throw new Error('kits/current.json.previous must be a non-empty string or null');
  }
  if (typeof obj.updatedAt !== 'string' || !obj.updatedAt) {
    throw new Error('kits/current.json.updatedAt must be a non-empty string');
  }
  // Deliberately NOT loud, unlike the fields above.
  //
  // The gate reads this registry through a `.catch(() => null)`, and a null registry
  // skips the kit check entirely — so throwing here would not refuse a bad document, it
  // would wave *every* delivery through, including one from a different major. A
  // corrupt optional field must degrade to the narrower rule, never the wider one.
  // Dropping it falls back to N/N−1, which is what this ref had before versions existed.
  //
  // The publisher validates the same value strictly, which is the right asymmetry:
  // loud where a human is watching a build, safe where a verdict depends on it.
  const currentVersion =
    typeof obj.currentVersion === 'string' && semverMajor(obj.currentVersion) !== null ? obj.currentVersion : undefined;
  return {
    current: obj.current,
    previous: obj.previous,
    ...(currentVersion === undefined ? {} : { currentVersion }),
    updatedAt: obj.updatedAt,
  };
}

/**
 * True when `engineRef` is the current kit, the previous one, or was packed at a
 * version sharing the current major.
 *
 * `claimedVersion` is the version recorded in that ref's own sidecar — the gate reads
 * it, because the registry cannot carry a list long enough to date arbitrarily old
 * refs and the sidecar is already immutable and per-ref.
 *
 * Both versions must parse and both must be present. An unversioned kit falls through
 * to N/N−1, which is what it had before versions existed.
 */
export function isKitEngineRefSupported(
  engineRef: string,
  registry: KitRegistry,
  claimedVersion?: string | null,
): boolean {
  if (!engineRef) return false;
  if (engineRef === registry.current) return true;
  if (registry.previous !== null && engineRef === registry.previous) return true;

  const claimedMajor = semverMajor(claimedVersion);
  const currentMajor = semverMajor(registry.currentVersion);
  if (claimedMajor === null || currentMajor === null) return false;
  // A ref from a *newer* major than current means the engine was rolled back, and the
  // APIs that delivery was written against are gone. Same-major only, both directions.
  return claimedMajor === currentMajor;
}

/**
 * Message the agent sees on a `kit_outdated` verdict. Names the supported window and
 * the refresh action — re-running get_kit is cheaper than guessing a commit.
 */
export function kitOutdatedReport(kitEngineRef: string, registry: KitRegistry): string {
  const window = registry.currentVersion
    ? // Say the rule, not the refs: "same major" is actionable, two opaque SHAs are not.
      `current kit is v${registry.currentVersion}; deliveries must share its major version`
    : registry.previous === null
      ? `current=${registry.current}`
      : `current=${registry.current}, previous=${registry.previous}`;
  return (
    `kit_outdated: delivery was built against kitEngineRef=${kitEngineRef}, which is ` +
    `outside the supported window (${window}). Re-run get_kit for a fresh engineRef, then ` +
    `submit_sources({ fromLatestDelivery: true, mode, kitEngineRef }) — pass the same mode ` +
    `as this delivery (preview stays preview); omit mode only to reuse that lane. Do not ` +
    `re-stage or re-upload the whole tree through the model. Only pass files[] for paths ` +
    `you actually changed for the new kit.`
  );
}
