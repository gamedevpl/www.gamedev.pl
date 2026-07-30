import type { FastifyInstance } from 'fastify';
import { isAdminSession } from './admin.js';
import { detectStall, isTerminal, toSubmissionStatus, type JobStall, type JobState } from './job-state.js';
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
      // since this shipped does not. Fall back to what the last derivation said so the
      // queue is complete from the first request rather than filling in gradually.
      const state: JobState | undefined =
        record.state ?? (record.lastStatus ? jobStateFromLastStatus(record.lastStatus) : undefined);
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

/** Narrow bridge for records that predate adoption — same mapping as job-state's. */
function jobStateFromLastStatus(status: SubmissionRecord['lastStatus']): JobState | undefined {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'building':
      return 'building';
    case 'in_review':
      return 'ready_for_review';
    case 'publishing':
      return 'publishing';
    case 'published':
      return 'published';
    case 'needs_changes':
      return 'needs_changes';
    case 'abandoned':
      return 'abandoned';
    default:
      return undefined;
  }
}

export async function registerJobAdminRoutes(
  app: FastifyInstance,
  options: { store?: Store; adminUids?: Set<string>; now?: () => number },
): Promise<void> {
  const { store, adminUids } = options;
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
}
