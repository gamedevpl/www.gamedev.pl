import { randomUUID } from 'node:crypto';
import type { GamesStore, SourceFile } from '../delivery/games-store.js';
import { canActOnGame } from '../platform/game-access-permissions.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import type { Store } from '../platform/store.js';
import { isActiveBuildRound } from './job-state.js';

// A content-only candidate: a new job carrying edited sources, no agent.

export type ContentJobRefusal = 'busy' | 'stale_owner' | 'round_in_progress' | 'link_refused';

export type GateTrigger = (input: {
  jobId: number;
  slug: string;
  version: string;
}) => Promise<{ buildId?: string } | void> | void;

export async function openContentJob(input: {
  store: Store;
  slug: string;
  ownerUid: string;
  title: string;
  locale?: string;
  reason: string;
  now: () => number;
  // Refuse while another round is building, not just while one is opening.
  requireIdle?: boolean;
  // Runs under the lease once the job exists; false abandons it.
  link?: (jobId: number) => Promise<boolean>;
}): Promise<{ ok: true; jobId: number } | { ok: false; error: ContentJobRefusal }> {
  const { store, slug, now } = input;
  const at = () => new Date(now()).toISOString();
  const nonce = randomUUID();
  if (!(await store.beginCheckoutRecovery(slug, nonce, Date.now()))) return { ok: false, error: 'busy' };
  try {
    const access = await resolveGameAccess(store, slug);
    if (access.source === 'canonical' && !canActOnGame(access, input.ownerUid, 'publish')) {
      return { ok: false, error: 'stale_owner' };
    }
    if (input.requireIdle) {
      const holder = await store.getSubmissionBySlug(slug);
      if (holder && isActiveBuildRound(holder)) return { ok: false, error: 'round_in_progress' };
    }
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, input.ownerUid, input.title);
    if (input.locale) await store.setSubmissionLocale(jobId, input.locale);
    await store.setSubmissionSlug(jobId, slug, nonce);
    await store.recordJobTransition(jobId, { to: 'queued', at: at(), by: 'creator', reason: input.reason });
    if (input.link && !(await input.link(jobId))) {
      await store.recordJobTransition(jobId, { to: 'abandoned', at: at(), by: 'creator', reason: 'link_refused' });
      await store.setSubmissionAbandoned(jobId, at());
      return { ok: false, error: 'link_refused' };
    }
    // Lease held until the job is itself an active round.
    await store.recordJobTransition(jobId, { to: 'building', at: at(), by: 'creator', reason: input.reason });
    return { ok: true, jobId };
  } finally {
    await store.finishCheckoutRecovery(slug, nonce).catch(() => {});
  }
}

export async function deliverContentCandidate(input: {
  store: Store;
  gamesStore: GamesStore;
  slug: string;
  jobId: number;
  files: SourceFile[];
  engineRef?: string;
  now: () => number;
  onSourcesDelivered?: GateTrigger;
}): Promise<{ version: string }> {
  const { store, jobId } = input;
  const at = () => new Date(input.now()).toISOString();
  let version: string;
  try {
    ({ version } = await input.gamesStore.putCandidateSources({
      slug: input.slug,
      jobId,
      files: input.files,
      backend: 'editor',
      origin: 'editor',
      // Judge a content edit on the engine known to work.
      ...(input.engineRef ? { engineRef: input.engineRef } : {}),
    }));
  } catch (error) {
    await store
      .recordJobTransition(jobId, { to: 'failed', at: at(), by: 'creator', reason: 'delivery_failed' })
      .catch(() => {});
    throw error;
  }
  await store.setSubmissionDeliveredVersion(jobId, version);
  await store.recordJobTransition(jobId, { to: 'submitted', at: at(), by: 'creator', reason: 'content_delivered' });
  const gate = await input.onSourcesDelivered?.({ jobId, slug: input.slug, version });
  if (gate?.buildId) {
    await store
      .recordJobCost(jobId, { kind: 'gate_run', at: new Date().toISOString(), by: 'cloud-build', ref: gate.buildId })
      .catch(() => {});
  }
  return { version };
}

// Opens a linked content job and delivers it, for an accepted proposal.
export function contentDelivery(deps: {
  store: Store;
  gamesStore: GamesStore;
  now: () => number;
  onSourcesDelivered?: GateTrigger;
}) {
  return async (input: {
    slug: string;
    ownerUid: string;
    title: string;
    locale?: string;
    files: SourceFile[];
    engineRef?: string;
    link: (jobId: number) => Promise<boolean>;
  }): Promise<{ ok: true; jobId: number } | { ok: false; error: ContentJobRefusal }> => {
    const opened = await openContentJob({
      ...deps,
      ...input,
      reason: 'proposal_accepted',
      requireIdle: true,
    });
    if (!opened.ok) return opened;
    await deliverContentCandidate({ ...deps, ...input, jobId: opened.jobId });
    return opened;
  };
}
