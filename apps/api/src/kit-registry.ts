/**
 * Creator Kit registry (`kits/current.json`) — supported N / N−1 window.
 *
 * Games-repo CI (BY-10) is the publisher. This module only parses what is already
 * in the bucket; it never invents an engineRef.
 */

import { semverMajor } from './kit-window.js';

export interface KitRegistry {
  current: string;
  previous: string | null;
  /** Semver of `current`. Absent on documents written before versioning shipped. */
  currentVersion?: string;
  updatedAt: string;
}

export interface KitSidecar {
  sha256: string;
  packedAt?: string;
  /** Semver this kit was packed at. Absent on kits published before versioning. */
  version?: string;
}

export class KitRegistryError extends Error {
  readonly code: 'kit_registry_missing' | 'kit_registry_invalid' | 'kit_artifact_missing';

  constructor(code: KitRegistryError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KitRegistryError';
    this.code = code;
  }
}

export function parseKitRegistry(raw: string): KitRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new KitRegistryError('kit_registry_invalid', 'kits/current.json is not valid JSON', { cause: error });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new KitRegistryError('kit_registry_invalid', 'kits/current.json must be an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.current !== 'string' || !obj.current) {
    throw new KitRegistryError('kit_registry_invalid', 'kits/current.json.current must be a non-empty string');
  }
  if (!(obj.previous === null || typeof obj.previous === 'string')) {
    throw new KitRegistryError('kit_registry_invalid', 'kits/current.json.previous must be a string or null');
  }
  if (typeof obj.updatedAt !== 'string' || !obj.updatedAt) {
    throw new KitRegistryError('kit_registry_invalid', 'kits/current.json.updatedAt must be a non-empty string');
  }
  // Dropped rather than rejected when malformed — see the same decision in
  // kit-window.ts. A corrupt optional field must degrade to the narrower N/N−1 rule,
  // never take the whole document down with it.
  const currentVersion =
    typeof obj.currentVersion === 'string' && semverMajor(obj.currentVersion) !== null ? obj.currentVersion : undefined;
  return {
    current: obj.current,
    previous: obj.previous,
    ...(currentVersion === undefined ? {} : { currentVersion }),
    updatedAt: obj.updatedAt,
  };
}

export function parseKitSidecar(raw: string): KitSidecar {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new KitRegistryError('kit_artifact_missing', 'kit sidecar is not valid JSON', { cause: error });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new KitRegistryError('kit_artifact_missing', 'kit sidecar must be an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(obj.sha256)) {
    throw new KitRegistryError('kit_artifact_missing', 'kit sidecar.sha256 must be a sha256 hex digest');
  }
  return {
    sha256: obj.sha256.toLowerCase(),
    ...(typeof obj.packedAt === 'string' ? { packedAt: obj.packedAt } : {}),
    ...(typeof obj.version === 'string' && obj.version ? { version: obj.version } : {}),
  };
}

/** Tarball member root from games-repo pack-kit (`KIT_NAME`). */
export const KIT_ROOT_DIR = 'gamedevpl-creator-kit';

/**
 * Path to open after unpack, relative to the directory where the unpack one-liner ran.
 * Not a post-`cd` basename: coding-agent shells often start each command in a fresh
 * process, so a trailing `cd` does not persist for `cat SKILL.md` / `npm ci`.
 */
export const KIT_ENTRY = `${KIT_ROOT_DIR}/SKILL.md`;

/** Shell-escape a URL for single-quoted use in an unpack one-liner. */
function shellSingleQuote(url: string): string {
  return url.replace(/'/g, `'\\''`);
}

/**
 * One-liner an agent can shell after get_kit — URL is substituted by the route.
 * Extracts into {@link KIT_ROOT_DIR}/ under the current working directory. Follow
 * {@link KIT_ENTRY} from that same cwd; do not rely on the shell remaining inside
 * the kit directory after this process exits.
 */
export function kitUnpackCommand(kitUrl: string): string {
  // Single-quoted URL so shell metacharacters in the signed query string stay inert.
  return `curl -fsSL '${shellSingleQuote(kitUrl)}' | tar -xz`;
}

/**
 * Exemplar tarballs root at `games/<slug>/` (pack into a kit checkout). No post-unpack cd.
 */
export function exampleUnpackCommand(tarballUrl: string): string {
  return `curl -fsSL '${shellSingleQuote(tarballUrl)}' | tar -xz`;
}
