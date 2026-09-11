// Giving an address to games that predate minting-at-submission.
//
// Two callers, one implementation: the operator route (POST /api/admin/slug-backfill)
// and the CLI (`npm run slug:backfill`). They exist separately because the route needs a
// browser session and the CLI needs only gcloud credentials, but what they *do* must not
// drift — this writes permanent public addresses, and a second implementation would be a
// second set of collision rules.

import { mintGameSlug } from '../platform/slug.js';
import { settleSlugClaim, type SlugClaimProbe } from '../platform/slug-ownership.js';
import type { SubmissionRecord } from '../platform/store.js';

export type { SlugClaimProbe };

/** The slice of the store a backfill touches. */
export interface SlugBackfillStore {
  listSubmissionsMissingSlug(): Promise<SubmissionRecord[]>;
  setSubmissionSlug(jobId: number, slug: string): Promise<void>;
  getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;
}

export interface SlugBackfillResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  named: number;
  failed: number;
  games: Array<{ jobId: number; title: string; slug: string | null }>;
}

/**
 * Names every slug-less, non-abandoned submission.
 *
 * Abandoned builds are skipped by the work list itself ({@link SlugBackfillStore.listSubmissionsMissingSlug}):
 * their creator stopped them, so they need no address and taking one would only crowd the
 * namespace.
 *
 * `dryRun` rehearses — it mints and reports, and writes nothing.
 */
export async function runSlugBackfill(options: {
  store: SlugBackfillStore;
  isSlugClaimed: SlugClaimProbe;
  dryRun: boolean;
  /** Overridable so the HTTP route can keep using its own GitHub-aware settle path. */
  confirmSlugClaim?: (jobId: number, slug: string, title: string) => Promise<string | null>;
}): Promise<SlugBackfillResult> {
  const { store, isSlugClaimed, dryRun } = options;
  const confirm =
    options.confirmSlugClaim ??
    ((jobId: number, slug: string, title: string) => settleSlugClaim(store, jobId, slug, title, isSlugClaimed));

  const pending = await store.listSubmissionsMissingSlug();

  // Names handed out earlier in this run. Redundant on the write path, where the store
  // already knows, and load-bearing on the dry run, where nothing is written and two
  // games with the same title would otherwise both be promised the same slug.
  const mintedHere = new Set<string>();
  const games: SlugBackfillResult['games'] = [];

  for (const record of pending) {
    const isTaken = async (candidate: string): Promise<boolean> =>
      mintedHere.has(candidate) || (await isSlugClaimed(candidate, record.jobId));
    const wanted = await mintGameSlug(record.title, isTaken);

    if (dryRun) {
      mintedHere.add(wanted);
      games.push({ jobId: record.jobId, title: record.title, slug: wanted });
      continue;
    }

    await store.setSubmissionSlug(record.jobId, wanted);
    // Same read-back as submission creation: the write is a claim, not a grant.
    const settled = await confirm(record.jobId, wanted, record.title);
    if (settled) mintedHere.add(settled);
    games.push({ jobId: record.jobId, title: record.title, slug: settled });
  }

  const named = games.filter((game) => game.slug !== null).length;
  return { ok: true, dryRun, scanned: pending.length, named, failed: pending.length - named, games };
}
