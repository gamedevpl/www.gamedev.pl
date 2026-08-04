/**
 * Creator Kit support window — N / N−1 from `kits/current.json`.
 *
 * The registry document is the only authority for which engine refs a delivery may
 * claim. Do not infer previous from git parents (the packer is path-filtered, so a
 * parent commit usually is not the previous kit) or from bucket listing order
 * (undefined). BY-10 owns the publisher; this module is the consumer rule the gate
 * and delivery path share.
 */

export type KitRegistry = {
  current: string;
  previous: string | null;
  updatedAt: string;
};

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
  return {
    current: obj.current,
    previous: obj.previous,
    updatedAt: obj.updatedAt,
  };
}

/** True when `engineRef` is the registry's current or previous kit. */
export function isKitEngineRefSupported(engineRef: string, registry: KitRegistry): boolean {
  if (!engineRef) return false;
  if (engineRef === registry.current) return true;
  if (registry.previous !== null && engineRef === registry.previous) return true;
  return false;
}

/**
 * Message the agent sees on a `kit_outdated` verdict. Names the supported window and
 * the refresh action — re-running get_kit is cheaper than guessing a commit.
 */
export function kitOutdatedReport(kitEngineRef: string, registry: KitRegistry): string {
  const window =
    registry.previous === null
      ? `current=${registry.current}`
      : `current=${registry.current}, previous=${registry.previous}`;
  return (
    `kit_outdated: delivery was built against kitEngineRef=${kitEngineRef}, which is ` +
    `outside the supported window (${window}). Re-run get_kit for a fresh engineRef, then ` +
    `submit_sources({ fromLatestDelivery: true, mode, kitEngineRef }) — do not re-stage or ` +
    `re-upload the whole tree through the model. Only pass files[] for paths you actually ` +
    `changed for the new kit.`
  );
}
