/**
 * Posts the first PNG a gate capture produced into the build thread.
 *
 * Same store path as agent-sent shots (`appendBuildShot`), so the studio renders it
 * identically. The label marks it as ours — a platform check frame, not an agent push.
 */

import { MAX_SHOT_BYTES } from '@gamedevpl/contract';
import type { GamesStore } from './games-store.js';
import type { Store } from './store.js';

/** Caption shown on the thread for a gate-produced frame. */
export const PLATFORM_CHECK_SHOT_LABEL = 'Platform check';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Picks the first screenshot path from a gate artifact list. Prefers the capture
 * harness's `opening.png` when present; otherwise the lexicographically first PNG so
 * the same artifact list always yields the same frame.
 */
export function firstGateScreenshotPath(artifacts: readonly string[]): string | undefined {
  const pngs = artifacts.filter((name) => /^media\/.+\.png$/i.test(name));
  const opening = pngs.find((name) => /\/opening\.png$/i.test(name));
  if (opening) return opening;
  return [...pngs].sort((a, b) => a.localeCompare(b))[0];
}

/**
 * Loads one gate-produced PNG and appends it as a build shot. Best effort: a missing
 * or non-PNG artifact must not fail the reconcile that already moved the job.
 */
export async function postGateScreenshotToThread(input: {
  store: Store;
  gamesStore: GamesStore;
  issueNumber: number;
  slug: string;
  version: string;
  /** Path under the version prefix, e.g. `media/opening.png`. */
  screenshotPath: string;
}): Promise<{ id: string } | null> {
  const body = await input.gamesStore.getDerivedArtifact(input.slug, input.version, input.screenshotPath);
  if (!body) return null;
  if (body.length === 0 || body.length > MAX_SHOT_BYTES) return null;
  if (!body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;

  const stored = await input.store.appendBuildShot(input.issueNumber, {
    data: body.toString('base64'),
    label: PLATFORM_CHECK_SHOT_LABEL,
  });
  return { id: stored.id };
}
