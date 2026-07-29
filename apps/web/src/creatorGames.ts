import { getSavedSpecs } from './mySpecs.js';
import { getSubmissionStatus, listMySubmissions, type SubmissionState } from './submissionApi.js';
import type { PixelIconName } from './PixelIcon.js';

/**
 * Creator-owned games for the home gallery. Published ones pin at the front of
 * the catalog; in-progress builds render as cards in the same grid so there is
 * no separate "Your games" section.
 *
 * Statuses come from the store (kept current by the notify sweep) — one list
 * request, no per-card GitHub reads. Locally saved specs fill gaps for
 * anonymous-era submissions and signed-out fallbacks.
 */

export const CREATOR_STATUS_ICONS: Record<SubmissionState, PixelIconName> = {
  queued: 'clock',
  building: 'wrench',
  in_review: 'eye',
  publishing: 'rocket',
  published: 'star',
  needs_changes: 'pencil',
  abandoned: 'trash',
};

export const CREATOR_LIVE_STATUSES = new Set<SubmissionState>([
  'queued',
  'building',
  'in_review',
  'publishing',
]);

/** How many in-progress builds the home gallery shows. Full shelf is Studio. */
export const MAX_IN_PROGRESS_IN_GALLERY = 4;

export type CreatorGameItem = {
  token: string;
  title: string;
  createdAt: number;
  status: SubmissionState | null;
  slug?: string;
};

export async function loadCreatorGames(locale: string): Promise<CreatorGameItem[]> {
  const local: CreatorGameItem[] = getSavedSpecs().map((spec) => ({
    token: spec.token,
    title: spec.title,
    createdAt: spec.createdAt,
    status: null,
  }));

  let merged = local;
  const listedByServer = new Set<string>();
  try {
    const remote = await listMySubmissions();
    const byToken = new Map(local.map((item) => [item.token, item]));
    for (const submission of remote) {
      const existing = byToken.get(submission.token);
      listedByServer.add(submission.token);
      byToken.set(submission.token, {
        token: submission.token,
        title: existing?.title ?? submission.title,
        createdAt: existing?.createdAt ?? Date.parse(submission.createdAt),
        status: submission.lastKnownStatus,
        slug: submission.slug ?? undefined,
      });
    }
    merged = [...byToken.values()];
  } catch {
    // Signed out, or the API is unreachable — the local list still stands.
  }

  merged.sort((a, b) => b.createdAt - a.createdAt);
  const visible = merged.filter((item) => item.status !== 'abandoned');

  const unlisted = visible.filter((item) => !listedByServer.has(item.token));
  if (unlisted.length === 0) return visible;

  const resolved = await Promise.all(
    unlisted.map(async (item) => {
      try {
        const status = await getSubmissionStatus(item.token, locale);
        return { ...item, status: status.status, slug: status.slug };
      } catch {
        return item;
      }
    }),
  );
  const byToken = new Map(resolved.map((item) => [item.token, item]));
  return visible.map((item) => byToken.get(item.token) ?? item).filter((item) => item.status !== 'abandoned');
}

/** Builds still in flight — shown as cards ahead of the published catalog. */
export function inProgressCreatorGames(items: CreatorGameItem[]): CreatorGameItem[] {
  return items
    .filter((item) => item.status !== 'published')
    .slice(0, MAX_IN_PROGRESS_IN_GALLERY);
}

/** Published slugs owned by the creator — pin these first in the catalog grid. */
export function publishedCreatorSlugs(items: CreatorGameItem[]): Set<string> {
  return new Set(
    items.flatMap((item) => (item.status === 'published' && item.slug ? [item.slug] : [])),
  );
}
