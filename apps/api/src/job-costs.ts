// What a game costs to build, from what was actually billed.
//
// The question this exists to answer is not "what is our cloud spend" — GCP already
// answers that, badly, for the whole project at once. It is "what does one game cost,
// and what does the failure rate cost", which nothing could answer because the spending
// was never attributed to the job that caused it.
//
// Every number here is derived from ledger entries written at the moment of spending
// (see `JobCostEntry`). Nothing is estimated, and nothing is inferred from state: a job
// that took four sessions reports four whether or not its transitions still say so.
//
// The unit problem is deliberate and load-bearing. Copilot bills a premium request per
// session and exposes no token counts; the gate bills Cloud Build minutes we do not yet
// read back. So credits and sessions are real, tokens and dollars are absent, and this
// module reports absence as absence rather than as zero — a report that said "$0.00 per
// game" would be worse than one that says the money is not measurable yet.

import { resolveJobState, type JobState } from './job-state.js';
import type { JobCostEntry, SubmissionRecord } from './store.js';

export interface JobCostSummary {
  issueNumber: number;
  title: string;
  slug?: string;
  state?: JobState;
  /** Agent sessions started. One premium request each on the Copilot backend. */
  sessions: number;
  /** Premium requests booked. Equal to `sessions` today; separate because it need not be. */
  credits: number;
  /** Gate runs started for this job — one per delivery that reached the verifier. */
  gateRuns: number;
  /** Present only when some backend actually reported tokens. */
  tokens?: { input: number; output: number };
  /** Present only when some service actually reported money. */
  usd?: number;
  /** Creation to the last thing that happened to it. */
  elapsedMs: number;
  /** Whether the spending bought a game anybody can play. */
  published: boolean;
  createdAt: string;
}

export interface CostTotals {
  jobs: number;
  sessions: number;
  credits: number;
  gateRuns: number;
  published: number;
  tokens?: { input: number; output: number };
  usd?: number;
}

export interface CostReport {
  /** Most expensive first — the tail is where a runaway job hides. */
  jobs: JobCostSummary[];
  totals: CostTotals;
  /**
   * The bizstrat number: what one published game costs, all in.
   *
   * Divides *every* credit spent in the window by the games that shipped, including the
   * credits spent on jobs that never did. That is the honest denominator — a build that
   * failed twice before succeeding cost three sessions, and so did the game.
   */
  creditsPerPublishedGame: number | null;
  /** Median wall-clock of the jobs that shipped. Null when none did. */
  medianTimeToPublishMs: number | null;
  /** Of the credits above, how many bought nothing playable. The cost of the failure rate. */
  creditsOnUnpublished: number;
  /**
   * Jobs in the window that have no ledger at all — dispatched before this recorded
   * anything. Reported so a small total is legible as "not measured yet" rather than
   * read as "cheap".
   */
  unmeasuredJobs: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Newest timestamp on the record, so elapsed time means something for a finished job. */
function lastActivityAt(record: SubmissionRecord): number {
  const stamps = [
    record.createdAt,
    record.stateSince,
    record.publishedAt,
    ...(record.transitions ?? []).map((transition) => transition.at),
    ...(record.costs ?? []).map((entry) => entry.at),
  ]
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((value) => Number.isFinite(value));
  return stamps.length > 0 ? Math.max(...stamps) : Date.parse(record.createdAt);
}

function summarize(record: SubmissionRecord): JobCostSummary {
  const entries: JobCostEntry[] = record.costs ?? [];
  const state = resolveJobState(record);
  const tokens = entries.reduce(
    (sum, entry) =>
      entry.tokens ? { input: sum.input + entry.tokens.input, output: sum.output + entry.tokens.output } : sum,
    { input: 0, output: 0 },
  );
  const usd = entries.reduce((sum, entry) => sum + (entry.usd ?? 0), 0);

  return {
    issueNumber: record.issueNumber,
    title: record.title,
    ...(record.slug ? { slug: record.slug } : {}),
    ...(state ? { state } : {}),
    sessions: entries.filter((entry) => entry.kind === 'agent_session').length,
    credits: entries.reduce((sum, entry) => sum + (entry.credits ?? 0), 0),
    gateRuns: entries.filter((entry) => entry.kind === 'gate_run').length,
    // Absent rather than zero: nothing reports these yet, and a zero would read as a
    // measurement that came back empty instead of one that was never taken.
    ...(tokens.input + tokens.output > 0 ? { tokens } : {}),
    ...(usd > 0 ? { usd } : {}),
    elapsedMs: Math.max(0, lastActivityAt(record) - Date.parse(record.createdAt)),
    published: state === 'published' || Boolean(record.publishedAt),
    createdAt: record.createdAt,
  };
}

export function buildCostReport(records: SubmissionRecord[]): CostReport {
  const jobs = records.map(summarize).sort((a, b) => b.credits - a.credits || b.elapsedMs - a.elapsedMs);

  const totals: CostTotals = {
    jobs: jobs.length,
    sessions: jobs.reduce((sum, job) => sum + job.sessions, 0),
    credits: jobs.reduce((sum, job) => sum + job.credits, 0),
    gateRuns: jobs.reduce((sum, job) => sum + job.gateRuns, 0),
    published: jobs.filter((job) => job.published).length,
  };

  const tokens = jobs.reduce(
    (sum, job) => (job.tokens ? { input: sum.input + job.tokens.input, output: sum.output + job.tokens.output } : sum),
    { input: 0, output: 0 },
  );
  if (tokens.input + tokens.output > 0) totals.tokens = tokens;
  const usd = jobs.reduce((sum, job) => sum + (job.usd ?? 0), 0);
  if (usd > 0) totals.usd = usd;

  return {
    jobs,
    totals,
    creditsPerPublishedGame: totals.published > 0 ? Math.round((totals.credits / totals.published) * 100) / 100 : null,
    medianTimeToPublishMs: median(jobs.filter((job) => job.published).map((job) => job.elapsedMs)),
    creditsOnUnpublished: jobs.filter((job) => !job.published).reduce((sum, job) => sum + job.credits, 0),
    unmeasuredJobs: records.filter((record) => (record.costs ?? []).length === 0).length,
  };
}
