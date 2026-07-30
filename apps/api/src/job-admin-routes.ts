import type { FastifyInstance } from 'fastify';
import { isAdminSession } from './admin.js';
import {
  detectStall,
  isTerminal,
  resolveJobState,
  toSubmissionStatus,
  type JobStall,
  type JobState,
} from './job-state.js';
import type { GamesStore } from './games-store.js';
import type { Store, SubmissionRecord } from './store.js';

/**
 * The operator's view of the build queue.
 *
 * There is no such view today, and its absence is the loudest gap in running the closed
 * beta: an operator cannot see which builds are in flight, how long each has been where
 * it is, or which ones have gone wrong — the creator-experience review records watching a
 * build run for three hours with no way to tell a stuck agent from a slow one.
 *
 * Answered entirely from the store. That is the point: it costs no GitHub calls, so
 * checking the queue can never spend the rate-limit budget that creation and (until the
 * snapshot took over) play depend on. It is also why this could not exist before jobs
 * carried their own state — deriving twenty submissions' status on demand is exactly the
 * fan-out that has taken the site down before.
 */

/** How long a job may sit in one state before the queue calls it out, per state. */
export interface JobQueueEntry {
  issueNumber: number;
  title: string;
  ownerUid: string;
  slug?: string;
  /** Internal state — richer than what the creator is shown. */
  state: JobState;
  /** What the creator sees for the same job, so the two can be compared at a glance. */
  creatorStatus: ReturnType<typeof toSubmissionStatus>;
  stateSince?: string;
  /** Milliseconds in the current state — the column an operator actually sorts by. */
  timeInStateMs?: number;
  /** Milliseconds since the job was created, however many states ago that was. */
  ageMs: number;
  /** Why this job looks stuck, or null when its silence is still within tolerance. */
  stall: JobStall | null;
  /** The agent backend's own last word, when we have one. */
  agentState?: string;
  /** Most recent transitions, newest first — how it got here. */
  recentTransitions: Array<{ to: JobState; at: string; by: string; reason?: string }>;
}

export interface JobQueueResponse {
  /** Non-terminal jobs, most-stalled first, then longest in state. */
  jobs: JobQueueEntry[];
  /** Counts by state, so "12 queued" is answerable without reading the list. */
  byState: Partial<Record<JobState, number>>;
  /** How many jobs report any stall — the number worth alerting on. */
  stalled: number;
}

const TRANSITIONS_SHOWN = 8;

/**
 * Ranks the queue the way an operator reads it: anything stalled first, because that is
 * the only part demanding action, then longest-waiting. A plain chronological list buries
 * the one broken build under nineteen healthy ones.
 */
function compareJobs(a: JobQueueEntry, b: JobQueueEntry): number {
  if (Boolean(a.stall) !== Boolean(b.stall)) return a.stall ? -1 : 1;
  return (b.timeInStateMs ?? b.ageMs) - (a.timeInStateMs ?? a.ageMs);
}

export function buildJobQueue(records: SubmissionRecord[], now: number): JobQueueResponse {
  const jobs = records
    .map((record): JobQueueEntry | null => {
      // A record adopted into the job model has a state; one that has never been polled
      // since this shipped does not. `resolveJobState` falls back to what the last
      // derivation said, so the queue is complete from the first request rather than
      // filling in gradually.
      const state = resolveJobState(record);
      if (!state || isTerminal(state)) return null;

      const stateSince = record.stateSince ?? record.createdAt;
      const lastAgentSignalAt = record.lastAgentSignalAt;

      return {
        issueNumber: record.issueNumber,
        title: record.title,
        ownerUid: record.ownerUid,
        slug: record.slug,
        state,
        creatorStatus: toSubmissionStatus(state),
        stateSince,
        timeInStateMs: Number.isFinite(Date.parse(stateSince)) ? now - Date.parse(stateSince) : undefined,
        ageMs: now - Date.parse(record.createdAt),
        stall: detectStall({ state, stateSince, lastAgentSignalAt, agentState: record.agentState, now }),
        agentState: record.agentState,
        recentTransitions: (record.transitions ?? []).slice(-TRANSITIONS_SHOWN).reverse(),
      };
    })
    .filter((entry): entry is JobQueueEntry => entry !== null)
    .sort(compareJobs);

  const byState: Partial<Record<JobState, number>> = {};
  for (const job of jobs) byState[job.state] = (byState[job.state] ?? 0) + 1;

  return { jobs, byState, stalled: jobs.filter((job) => job.stall).length };
}

export async function registerJobAdminRoutes(
  app: FastifyInstance,
  options: { store?: Store; adminUids?: Set<string>; gamesStore?: GamesStore; now?: () => number },
): Promise<void> {
  const { store, adminUids, gamesStore } = options;
  const now = options.now ?? Date.now;

  app.get('/api/admin/jobs', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!store) {
      return reply.code(503).send({ error: 'store_unavailable' });
    }

    const records = await store.listActiveSubmissions();
    return reply.send(buildJobQueue(records, now()));
  });

  /**
   * Publishes a gate-green build. This is the moderation boundary, exercised.
   *
   * Deliberately an operator action rather than something the gate does on green. The
   * gate answers "does this run"; a human answers "may this be on the site", and those
   * are different questions — the second is the one the DSA and the AI Act care about,
   * and automating it would delete the boundary while leaving every document that claims
   * we have one. So the gate records a verdict, and this is where someone acts on it.
   *
   * The green check is re-read from the manifest here rather than trusted from the job's
   * state. Job state is derived on a poll and can be stale or adopted from an older
   * record; the manifest is what the gate actually wrote. Publishing is the one action
   * where the difference could put an unverified game in front of players.
   */
  app.post<{ Params: { issueNumber: string } }>('/api/admin/jobs/:issueNumber/publish', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!store || !gamesStore) {
      return reply.code(503).send({ error: 'store_unavailable' });
    }

    const issueNumber = Number(request.params.issueNumber);
    if (!Number.isInteger(issueNumber)) {
      return reply.code(400).send({ error: 'invalid_job' });
    }

    const record = await store.getSubmission(issueNumber);
    if (!record) return reply.code(404).send({ error: 'not_found' });
    if (!record.slug || !record.deliveredVersion) {
      return reply.code(409).send({ error: 'nothing_delivered' });
    }

    const manifest = await gamesStore.getManifest(record.slug, record.deliveredVersion);
    if (!manifest?.gate) return reply.code(409).send({ error: 'not_gated' });
    if (!manifest.gate.green) return reply.code(409).send({ error: 'gate_red' });

    const at = new Date(now()).toISOString();
    // Through `publishing` rather than straight to `published`: the intermediate state is
    // what a job is in while this is happening, and skipping it would leave no record
    // that it ever was — which is the state a failed publish has to fall back from.
    await store.recordJobTransition(issueNumber, { to: 'publishing', at, by: 'operator', reason: 'approved' });
    await store.setPublication({
      slug: record.slug,
      state: 'published',
      currentVersion: record.deliveredVersion,
      publishedAt: at,
    });
    await store.recordJobTransition(issueNumber, { to: 'published', at, by: 'operator', reason: 'published' });
    await store.setSubmissionPublishedAt(issueNumber, at);

    return reply.send({ ok: true, slug: record.slug, version: record.deliveredVersion, publishedAt: at });
  });
}
