// Giving an address to games that predate minting-at-submission.
//
// Two callers, one implementation: the operator route (POST /api/admin/slug-backfill)
// and the CLI (`npm run slug:backfill`). They exist separately because the route needs a
// browser session and the CLI needs only gcloud credentials, but what they *do* must not
// drift — this writes permanent public addresses, and a second implementation would be a
// second set of collision rules.

import { mintGameSlug } from './slug.js';
import type { SubmissionRecord } from '../platform/store.js';

/** The slice of the store a backfill touches. */
export interface SlugBackfillStore {
  listSubmissionsMissingSlug(): Promise<SubmissionRecord[]>;
  setSubmissionSlug(issueNumber: number, slug: string): Promise<void>;
  getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;
}

/** Whether anything already answers to this name; `except` excuses a record's own slug. */
export type SlugClaimProbe = (slug: string, except?: number) => Promise<boolean>;

export interface SlugBackfillResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  named: number;
  failed: number;
  games: Array<{ issueNumber: number; title: string; slug: string | null }>;
}

/**
 * Reads back a slug a job just wrote, and settles who actually holds it.
 *
 * `getSubmissionBySlug` is the same oracle every later lookup uses — the draft route, the
 * play route, the delivery check — so asking it "who owns this name" is exactly the
 * question that matters, and it answers deterministically even when two records share a
 * slug. Whoever it does not name has lost the race and takes a different name; the winner
 * is undisturbed and never learns any of this happened.
 *
 * Returns the slug this job ended up with, or null when even the second attempt lost.
 */
export async function settleSlugClaim(
  store: SlugBackfillStore,
  issueNumber: number,
  slug: string,
  title: string,
  isSlugClaimed: SlugClaimProbe,
): Promise<string | null> {
  const holds = async (candidate: string): Promise<boolean> => {
    const holder = await store.getSubmissionBySlug(candidate);
    return holder?.issueNumber === issueNumber;
  };

  if (await holds(slug)) return slug;

  // Lost. Mint again, this time treating anything we do not ourselves hold as taken,
  // and write it before re-reading — the second write is what makes the second read
  // meaningful.
  const retry = await mintGameSlug(title, async (candidate) => {
    if (candidate === slug) return true;
    return isSlugClaimed(candidate, issueNumber);
  });
  await store.setSubmissionSlug(issueNumber, retry);
  return (await holds(retry)) ? retry : null;
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
  confirmSlugClaim?: (issueNumber: number, slug: string, title: string) => Promise<string | null>;
}): Promise<SlugBackfillResult> {
  const { store, isSlugClaimed, dryRun } = options;
  const confirm =
    options.confirmSlugClaim ??
    ((issueNumber: number, slug: string, title: string) =>
      settleSlugClaim(store, issueNumber, slug, title, isSlugClaimed));

  const pending = await store.listSubmissionsMissingSlug();

  // Names handed out earlier in this run. Redundant on the write path, where the store
  // already knows, and load-bearing on the dry run, where nothing is written and two
  // games with the same title would otherwise both be promised the same slug.
  const mintedHere = new Set<string>();
  const games: SlugBackfillResult['games'] = [];

  for (const record of pending) {
    const isTaken = async (candidate: string): Promise<boolean> =>
      mintedHere.has(candidate) || (await isSlugClaimed(candidate, record.issueNumber));
    const wanted = await mintGameSlug(record.title, isTaken);

    if (dryRun) {
      mintedHere.add(wanted);
      games.push({ issueNumber: record.issueNumber, title: record.title, slug: wanted });
      continue;
    }

    await store.setSubmissionSlug(record.issueNumber, wanted);
    // Same read-back as submission creation: the write is a claim, not a grant.
    const settled = await confirm(record.issueNumber, wanted, record.title);
    if (settled) mintedHere.add(settled);
    games.push({ issueNumber: record.issueNumber, title: record.title, slug: settled });
  }

  const named = games.filter((game) => game.slug !== null).length;
  return { ok: true, dryRun, scanned: pending.length, named, failed: pending.length - named, games };
}
