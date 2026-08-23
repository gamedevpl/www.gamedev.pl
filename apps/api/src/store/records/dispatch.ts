import type { AgentSessionTokens } from '../../creation/job-state.js';
import type { Store } from '../../platform/store.js';
import type { SubmissionRecord } from './submission.js';

/**
 * One new game's round-0 outcome, written whatever happened.
 *
 * `staged` is the one that matters operationally: a draft that was generated but could
 * not be placed is money spent for nothing, and it is invisible from the creator's side
 * because seeding still fails open. `compiles` is the quality signal — it decides
 * whether the creator ever saw a round-0 preview — and `repaired` says whether reaching
 * that verdict took a second model call.
 */
export interface JobSeedOutcome {
  at: string;
  // Whether a draft came back at all; false carries only `reason`.
  generated: boolean;
  // Why generation produced nothing. Free text from the seeder.
  reason?: string;
  /** Published games put in front of the model, in pick order. */
  references: string[];
  /** Wall-clock for the whole seed, including any repair round. */
  ms: number;
  /** Whether the draft's TypeScript bundled — the round-0 preview depends on it. */
  compiles: boolean;
  /** Whether a repair round ran before that verdict. */
  repaired: boolean;
  // Whether placement happened — never merely which delivery mode was chosen.
  staged: boolean;
  // Which vendor and model answered. Absent means Vertex (before multi-provider).
  provider?: string;
  model?: string;
}

/**
 * One billed thing, attached to the job that incurred it.
 *
 * The units are deliberately plural. Copilot bills a *premium request* per session and
 * exposes no token counts at all — so credits is the only honest number we can record
 * for it, and a schema built around tokens would have had to lie or leave them zero.
 * `tokens` and `usd` exist unpopulated for the backend that would report them
 * (docs: architecture B), so that arriving is a writer, not a migration.
 */
export interface JobCostEntry {
  kind: 'agent_session' | 'gate_run' | 'seed' | 'assist' | 'chat' | 'tab_complete';
  at: string;
  /**
   * Who charged for it: an agent backend (`copilot`), a service (`cloud-build`), or —
   * for a `seed` entry — the model id that billed the tokens (`gemini-3.7-flash`).
   * A model id here is a well-formed entry, not corrupt data.
   */
  by: string;
  /** The vendor's own id, so a line on a bill can be traced back to a job. */
  ref?: string;
  /**
   * AI credits billed. For an `agent_session` this starts as a placeholder of 1 at
   * dispatch (usage is not on the create response) and is overwritten with the real
   * `session.usage.amount / 1e9` once observation sees it — measured sessions run
   * 46–861 credits, so leaving the placeholder would under-report by up to 860×.
   */
  credits?: number;
  /**
   * True once `credits` came from the vendor's usage figure rather than the dispatch
   * placeholder. Lets the reconciler stop re-polling a finished task for a cost it
   * already has, without mistaking a real 1-credit session for an unmeasured one.
   */
  creditsMeasured?: boolean;
  /**
   * Model tokens, when the thing that spent them reports them.
   *
   * The `seed` kind is the first writer: a direct Vertex call bills per token and the
   * SDK hands the count back, so a seeded job carries a real measurement rather than the
   * absence Copilot's opaque premium requests leave behind.
   */
  tokens?: AgentSessionTokens;
  /** Money, when a service reports it directly rather than in its own unit. */
  usd?: number;
  // Which vendor billed this; `by` stays the model id.
  provider?: string;
}

/**
 * How many cost entries a job keeps. Higher than the transition cap: transitions are
 * how a job got somewhere and only the tail matters, while a dropped cost entry is
 * money that silently stops being counted.
 */
export const MAX_JOB_COSTS = 200;

// Both stores share this; `null` means do not write.
export function applyMeasuredTokens(
  costs: readonly JobCostEntry[],
  ref: string,
  tokens: AgentSessionTokens,
): JobCostEntry[] | null {
  const sameTokens = (left: AgentSessionTokens | undefined, right: AgentSessionTokens): boolean => {
    if (!left) return false;
    if (left.vendor === 'gemini' || right.vendor === 'gemini') {
      return (
        left.vendor === 'gemini' &&
        right.vendor === 'gemini' &&
        left.model === right.model &&
        left.input === right.input &&
        left.output === right.output &&
        left.total === right.total &&
        left.thought === right.thought &&
        left.cached === right.cached &&
        left.toolUse === right.toolUse
      );
    }
    if (left.vendor === 'openai' || right.vendor === 'openai') {
      return (
        left.vendor === 'openai' &&
        right.vendor === 'openai' &&
        left.model === right.model &&
        left.input === right.input &&
        left.output === right.output &&
        left.total === right.total &&
        left.reasoning === right.reasoning &&
        left.cached === right.cached
      );
    }
    return (
      left.input === right.input &&
      left.output === right.output &&
      left.vendor === right.vendor &&
      left.model === right.model
    );
  };
  let changed = false;
  const next = costs.map((entry) => {
    if (entry.kind !== 'agent_session' || entry.ref !== ref) return entry;
    const same = sameTokens(entry.tokens, tokens);
    const placeholder = entry.credits !== undefined && !entry.creditsMeasured;
    if (same && !placeholder) return entry;
    changed = true;
    const { credits: _dropped, ...withoutCredits } = entry;
    return placeholder ? { ...withoutCredits, tokens } : { ...entry, tokens };
  });
  return changed ? next : null;
}

/**
 * How many transitions a submission keeps. Oldest are dropped first; the tail is what
 * anyone debugging a live build actually looks at.
 */
export const MAX_JOB_TRANSITIONS = 50;

/**
 * Where our own job ids start.
 *
 * Chosen to sit far above any number GitHub will plausibly assign an issue in the games
 * repo (which is in the low hundreds). It began as a discriminator — a job's id alone
 * said which era it belonged to, and routes branched on it — and that job is finished:
 * the GitHub-keyed path was removed on 2026-07-30 and `isNativeJobId` with it.
 *
 * **The floor itself stays, and not for history.** Those old jobs are still documents in
 * `submissions`, keyed by their issue number, and a document key is forever. Allocating
 * from 1 would hand a new build the id of a real creator's old one and quietly write into
 * their record. The floor is what makes the id space append-only.
 */
export const JOB_ID_FLOOR = 1_000_000;

// Counts dispatches on this job plus earlier sibling jobs (own refs undercount).
export async function dispatchAttempt(
  store: Pick<Store, 'listSubmissionsBySlug'>,
  record: Pick<SubmissionRecord, 'dispatch' | 'slug' | 'issueNumber' | 'ownerUid' | 'createdAt'>,
): Promise<number> {
  const ownAttempts = record.dispatch?.refs?.length ?? 0;
  if (!record.slug) return Math.max(ownAttempts, 1);
  const siblings = await store.listSubmissionsBySlug(record.slug);
  const priorAttempts = siblings
    .filter(
      (sibling) =>
        sibling.issueNumber !== record.issueNumber &&
        sibling.ownerUid === record.ownerUid &&
        sibling.createdAt < record.createdAt,
    )
    .reduce((sum, sibling) => sum + (sibling.dispatch?.refs?.length ?? 0), 0);
  return Math.max(ownAttempts + priorAttempts, 1);
}
