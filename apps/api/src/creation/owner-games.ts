import type { SubmissionRecord } from '../platform/store.js';

/** Studio shelf ceiling — distinct games, not raw jobs. */
export const MAX_OWNER_GAMES = 50;

export interface OwnerGame {
  /** Newest job for this game — what the shelf shows and what tokens address. */
  tip: SubmissionRecord;
  /**
   * Publish time from a sibling job when the tip is not published but the game is
   * still live in the catalog. Never copied onto `tip.publishedAt`.
   */
  catalogPublishedAt?: string;
}

function groupKey(record: SubmissionRecord): string {
  return record.slug ?? `issue:${record.jobId}`;
}

function isShelfEligible(record: SubmissionRecord): boolean {
  return !record.abandonedAt && record.state !== 'canceled';
}

function isPublishedEligible(record: SubmissionRecord): boolean {
  return !record.abandonedAt;
}

function hasPublishedAt(record: SubmissionRecord): boolean {
  return Boolean(record.publishedAt);
}

/**
 * Collapse a creator's jobs to one row per game (slug, or issue when slugless).
 *
 * The tip is the newest job in each group. Published mode keeps only groups with a
 * published sibling; shelf mode drops abandoned and operator-canceled jobs.
 */
export function collapseJobsToOwnerGames(jobs: readonly SubmissionRecord[], mode: 'shelf' | 'published'): OwnerGame[] {
  const filtered = jobs.filter(mode === 'shelf' ? isShelfEligible : isPublishedEligible);

  const groups = new Map<string, SubmissionRecord[]>();
  for (const job of filtered) {
    const key = groupKey(job);
    const group = groups.get(key);
    if (group) group.push(job);
    else groups.set(key, [job]);
  }

  // jobId breaks a createdAt tie, so round order cannot change the answer.
  const byNewest = (a: SubmissionRecord, b: SubmissionRecord): number =>
    b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId;

  const collapsed: OwnerGame[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(byNewest);
    const tip = sorted[0]!;

    if (mode === 'published' && !group.some(hasPublishedAt)) continue;

    const publishedSibling = sorted.find(hasPublishedAt);
    const ownerGame: OwnerGame = { tip };
    if (publishedSibling && !tip.publishedAt) {
      ownerGame.catalogPublishedAt = publishedSibling.publishedAt;
    }
    collapsed.push(ownerGame);
  }

  return collapsed.sort((a, b) => byNewest(a.tip, b.tip));
}

/** Apply the shelf ceiling after collapsing jobs to distinct games. */
export function pageOwnerGames(
  jobs: readonly SubmissionRecord[],
  mode: 'shelf' | 'published',
): { games: OwnerGame[]; total: number; truncated: boolean } {
  const collapsed = collapseJobsToOwnerGames(jobs, mode);
  const total = collapsed.length;
  const truncated = total > MAX_OWNER_GAMES;
  return { games: collapsed.slice(0, MAX_OWNER_GAMES), total, truncated };
}
