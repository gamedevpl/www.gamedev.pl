import type { BuildBrief } from './agent-backend.js';

// Public handle lookup; the uid itself never reaches the vendor.
export type CreatorHandleLookup = (ownerUid: string) => Promise<string | null | undefined>;

// Console label "<handle>/<slug>"; a failed lookup only drops the handle.
export async function sessionTitle(
  brief: Pick<BuildBrief, 'jobId' | 'slug' | 'ownerUid'>,
  creatorHandle?: CreatorHandleLookup,
): Promise<string> {
  const handle =
    brief.ownerUid && creatorHandle ? await creatorHandle(brief.ownerUid).catch(() => undefined) : undefined;
  const game = brief.slug ?? `job-${brief.jobId}`;
  return handle ? `${handle}/${game}` : game;
}
