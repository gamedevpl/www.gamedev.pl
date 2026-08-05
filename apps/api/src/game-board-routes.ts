import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isTerminal, type JobState } from './job-state.js';
import { OPEN_SUGGESTION_STATUSES, type Store, type SubmissionRecord, type SuggestionRecord } from './store.js';

/**
 * The public task board — `GET /api/games/:slug/board`.
 *
 * Four columns, matching the "repo page" layout (ops `docs/game-page-plan.md`):
 * open tasks → being built → built and waiting to be played → released. Nothing here
 * is a new work model: the middle two columns are a projection of the job state
 * machine (`job-state.ts`) onto a game's slug, the last is the jobs that shipped, and
 * the first is the IL-3 suggestion inbox for this game.
 *
 * **The open column is owner-only, and that is a privacy decision.** Suggestions are
 * derived from a game's scorecard — per-game play, error and vote aggregates that are
 * creator- and operator-facing everywhere else in the product. Publishing them here
 * would make "which games are going badly" a public listing, which is a call for the
 * owner to make deliberately rather than one a board layout makes by accident. A
 * signed-out visitor is told the column exists and is private, never shown a hole.
 *
 * Assignment stays where it already lives: `POST /api/me/suggestions/:id/approve`
 * (suggestion-inbox.ts) is what turns an open task into a build, charges the
 * improvement quota, and records who decided. This route reads; it never dispatches.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

/** How many rows a column may carry. A board is a working surface, not an archive. */
const COLUMN_LIMIT = 20;

/** Job states that mean "an agent is working on this right now". */
const BUILDING_STATES: ReadonlySet<JobState> = new Set<JobState>(['queued', 'dispatched', 'building']);

/** Job states that mean "sources exist and are waiting on the human review step". */
const REVIEW_STATES: ReadonlySet<JobState> = new Set<JobState>(['submitted', 'gating', 'ready_for_review']);

/** One open task — an IL-3 suggestion. Owner-only; carries no player-authored text. */
export interface BoardOpenTask {
  id: string;
  /** `defect` | `friction` | `design-change` — the routed class, not free text. */
  taskClass: string;
  priority: number;
  /** Platform-computed findings. Safe to render; never game- or player-authored. */
  findings: string[];
  createdAt: string;
}

/** One piece of work in flight or shipped. Public. */
export interface BoardWorkItem {
  title: string;
  state: JobState;
  /** When it entered its current state (or was created, for older records). */
  since: string;
  /** Present only for the owner — a job id is not a fact a visitor needs. */
  jobId?: number;
  /** True when the round was opened by the game's own agent rather than a person. */
  agentOpened?: boolean;
}

export interface GameBoardResponse {
  /** Owner-only. Empty for everyone else — read `openVisibility` to know why. */
  open: BoardOpenTask[];
  building: BoardWorkItem[];
  review: BoardWorkItem[];
  released: BoardWorkItem[];
  /** `owner` when the open column is real; `private` when it is withheld. */
  openVisibility: 'owner' | 'private';
  viewerIsOwner: boolean;
}

export interface GameBoardRoutesOptions {
  store: Store;
  now?: () => number;
}

export async function registerGameBoardRoutes(app: FastifyInstance, options: GameBoardRoutesOptions): Promise<void> {
  const { store } = options;

  app.get('/api/games/:slug/board', async (request, reply) => {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug)) {
      return reply.status(400).send({ error: 'invalid slug' });
    }
    const slug = params.data.slug;

    try {
      // Same existence gate as the page: a board for a game nobody can see is a 404,
      // and publication (not the bucket, not a job) is what decides that. A takedown
      // is decisive — an archived or disabled publication 404s even though the job
      // that shipped it still carries `publishedAt`, or the board would outlive the
      // game it describes. Only a game with no publication record at all falls back
      // to the job, which is how repo-migrated games reach this route.
      const publication = await store.getPublication(slug);
      const published = await store.getPublishedSubmissionBySlug(slug);
      const visible = publication ? publication.state === 'published' : Boolean(published);
      if (!visible) return reply.status(404).send({ error: 'not_found' });

      const uid = request.user?.uid ?? null;
      const viewerIsOwner = Boolean(uid && published?.ownerUid && published.ownerUid === uid);

      const submissions = await store.listSubmissionsBySlug(slug);
      const open = viewerIsOwner ? await readOpenTasks(store, slug, uid!) : [];

      const body: GameBoardResponse = {
        open,
        building: projectWork(submissions, BUILDING_STATES, viewerIsOwner),
        review: projectWork(submissions, REVIEW_STATES, viewerIsOwner),
        released: projectReleased(submissions, viewerIsOwner),
        openVisibility: viewerIsOwner ? 'owner' : 'private',
        viewerIsOwner,
      };
      return reply.send(body);
    } catch (error) {
      request.log.error({ err: error, slug }, 'failed to build game board');
      return reply.status(502).send({ error: 'failed to load board' });
    }
  });
}

async function readOpenTasks(store: Store, slug: string, ownerUid: string): Promise<BoardOpenTask[]> {
  // Narrowed by owner in the query (an indexed field) and by slug in memory: a
  // creator's open set is bounded by their own shelf, so this stays a small read.
  const suggestions = await store.listSuggestions({
    status: [...OPEN_SUGGESTION_STATUSES],
    ownerUid,
    limit: 100,
  });
  return suggestions
    .filter((record) => record.slug === slug)
    .slice(0, COLUMN_LIMIT)
    .map(toOpenTask);
}

function toOpenTask(record: SuggestionRecord): BoardOpenTask {
  return {
    id: record.id,
    taskClass: record.class,
    priority: record.priority,
    findings: record.evidence.map((item) => item.finding),
    createdAt: record.createdAt,
  };
}

function projectWork(
  submissions: SubmissionRecord[],
  states: ReadonlySet<JobState>,
  includeJobId: boolean,
): BoardWorkItem[] {
  return submissions
    .filter((record) => {
      if (record.abandonedAt) return false;
      const state = record.state;
      return state !== undefined && states.has(state);
    })
    .slice(0, COLUMN_LIMIT)
    .map((record) => toWorkItem(record, includeJobId));
}

function projectReleased(submissions: SubmissionRecord[], includeJobId: boolean): BoardWorkItem[] {
  return submissions
    .filter((record) => Boolean(record.publishedAt))
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, COLUMN_LIMIT)
    .map((record) => ({
      title: record.title,
      state: 'published' as JobState,
      since: record.publishedAt ?? record.createdAt,
      ...(includeJobId ? { jobId: record.issueNumber } : {}),
    }));
}

function toWorkItem(record: SubmissionRecord, includeJobId: boolean): BoardWorkItem {
  // A round the game's own agent opened (MCP `open_round`) reads differently from one
  // a person asked for — the mockup's "agent" byline, from data rather than a guess.
  // Matched on the reason alone: `by: 'agent'` appears on every round an agent works,
  // so it says who is building, not who asked for it.
  const agentOpened = record.transitions?.some((transition) => transition.reason === 'agent_open_round');
  return {
    title: record.title,
    state: (record.state ?? 'queued') as JobState,
    since: record.stateSince ?? record.createdAt,
    ...(includeJobId ? { jobId: record.issueNumber } : {}),
    ...(agentOpened ? { agentOpened: true } : {}),
  };
}

/** Exported for the tests that assert the column vocabulary stays in step with job states. */
export const BOARD_STATE_SETS = { BUILDING_STATES, REVIEW_STATES, isTerminal };
