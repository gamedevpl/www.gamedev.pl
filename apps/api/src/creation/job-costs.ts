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
// The unit problem is narrower than it looks. Copilot bills AI credits per session
// (`session.usage.amount`, nano-credits) and exposes no token counts, so tokens stay
// absent — but a credit is not a proxy for money, it *is* money in another unit, and
// converting it estimates nothing. What remains genuinely unpriced is Cloud Build
// minutes behind the gate, which is a smaller and nameable hole rather than the whole
// money column.
//
// Where absence is still the truth, this module reports absence rather than zero: a job
// with no ledger reads as unmeasured, not as free.

import { resolveJobState, type JobState } from './job-state.js';
import type { JobCostEntry, SubmissionRecord } from '../platform/store.js';

/**
 * GitHub fixes an AI credit at $0.01 — 100 credits to the dollar, a published rate rather
 * than a quote that moves with usage.
 *
 * Credits stay the *stored* unit: the ledger books what was actually billed, in the unit
 * the bill is denominated in, and the conversion happens here on read. If the rate ever
 * changes, that is one constant and no migration — and a historical entry still says what
 * it said when it was written.
 */
export const USD_PER_CREDIT = 0.01;

/** Money is only ever reported to the cent; floating-point sums are not. */
function cents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

export interface JobCostSummary {
  jobId: number;
  title: string;
  slug?: string;
  state?: JobState;
  /** Agent sessions started (ledger rows of kind `agent_session`). */
  sessions: number;
  /**
   * AI credits booked. Equal to `sessions` only while every row still holds the
   * dispatch placeholder of 1; once observation writes real usage, this is the sum of
   * those figures (typically tens to hundreds per session).
   */
  credits: number;
  /** Gate runs started for this job — one per delivery that reached the verifier. */
  gateRuns: number;
  /**
   * Whether this job's agent started from a generated first draft.
   *
   * Read from the ledger, not from configuration: seeding fails open, so the flag being
   * on does not mean a given build got one. This is what lets production traffic keep
   * answering the question the seed A/B answered on three specs — seeded and unseeded
   * builds are both in here, labelled, with their sessions and wall-clock beside them.
   */
  seeded: boolean;
  /** Present only when some backend actually reported tokens. */
  tokens?: { input: number; output: number };
  /**
   * What this job cost, in money: credits at the fixed rate plus anything a service
   * priced directly.
   *
   * Absent when no *priced* spending was recorded — which is not the same as no ledger.
   * A gate run is booked as an entry with neither credits nor dollars, because Cloud
   * Build minutes are billed and nothing reads the price back, so a job can have a
   * ledger and still have nothing to report here.
   */
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
  /** How many of the jobs above started from a generated draft. */
  seededJobs: number;
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
  /** The same number in money, which is the one worth quoting. */
  usdPerPublishedGame: number | null;
  /** Median wall-clock of the jobs that shipped. Null when none did. */
  medianTimeToPublishMs: number | null;
  /** Of the credits above, how many bought nothing playable. The cost of the failure rate. */
  creditsOnUnpublished: number;
  /** The failure rate priced. */
  usdOnUnpublished: number;
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
  const credits = entries.reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  // Credits converted, plus anything a service priced in dollars directly. The two are
  // added rather than treated as alternatives: they are different spending, not two
  // measurements of the same spending.
  const usd = cents(credits * USD_PER_CREDIT + entries.reduce((sum, entry) => sum + (entry.usd ?? 0), 0));

  return {
    jobId: record.jobId,
    title: record.title,
    ...(record.slug ? { slug: record.slug } : {}),
    ...(state ? { state } : {}),
    sessions: entries.filter((entry) => entry.kind === 'agent_session').length,
    credits,
    gateRuns: entries.filter((entry) => entry.kind === 'gate_run').length,
    seeded: entries.some((entry) => entry.kind === 'seed'),
    // Absent rather than zero: a zero would read as a measurement that came back empty
    // instead of one that was never taken. Seeds report tokens and Copilot sessions do
    // not, so a seeded job's token count is the seed's alone — real, and not the whole
    // story. Money is absent on the same rule: a missing figure means no priced spending
    // was recorded, which still includes a job whose only entries are unpriced gate runs.
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
    seededJobs: jobs.filter((job) => job.seeded).length,
    gateRuns: jobs.reduce((sum, job) => sum + job.gateRuns, 0),
    published: jobs.filter((job) => job.published).length,
  };

  const tokens = jobs.reduce(
    (sum, job) => (job.tokens ? { input: sum.input + job.tokens.input, output: sum.output + job.tokens.output } : sum),
    { input: 0, output: 0 },
  );
  if (tokens.input + tokens.output > 0) totals.tokens = tokens;
  const usd = cents(jobs.reduce((sum, job) => sum + (job.usd ?? 0), 0));
  if (usd > 0) totals.usd = usd;

  const unpublished = jobs.filter((job) => !job.published);

  return {
    jobs,
    totals,
    creditsPerPublishedGame: totals.published > 0 ? Math.round((totals.credits / totals.published) * 100) / 100 : null,
    // Divided from the total rather than averaged over the per-job dollars, so the cents
    // dropped by rounding each job do not compound into the headline.
    usdPerPublishedGame: totals.published > 0 ? cents(usd / totals.published) : null,
    medianTimeToPublishMs: median(jobs.filter((job) => job.published).map((job) => job.elapsedMs)),
    creditsOnUnpublished: unpublished.reduce((sum, job) => sum + job.credits, 0),
    usdOnUnpublished: cents(unpublished.reduce((sum, job) => sum + (job.usd ?? 0), 0)),
    unmeasuredJobs: records.filter((record) => (record.costs ?? []).length === 0).length,
  };
}
