import type { AutonomyMode } from '@gamedevpl/contract';
import type { SuggestionRecord } from '../platform/store.js';

/**
 * Bounded autonomy (docs/improvement-loop-plan.md IL-4).
 *
 * What a creator has agreed the platform may do to their game without asking first. The
 * default is `suggest`, and it stays the default: a game whose owner has never opened
 * this setting must never have work started on it by a machine.
 *
 * **Autonomy here means "start work", never "publish".** That distinction used to be a
 * policy this phase had to enforce; it is now structural — `publishing` is reachable only
 * from `ready_for_review` in the job state machine, so nothing dispatched autonomously can
 * reach the site without the human review that is the moderation boundary. The worst an
 * over-eager router can do is spend an agent run and produce a candidate somebody declines.
 */
export { AUTONOMY_MODES, type AutonomyMode } from '@gamedevpl/contract';

export const DEFAULT_AUTONOMY: AutonomyMode = 'suggest';

/**
 * Whether a class may be dispatched without asking.
 *
 * `design-change` is never autonomous; neither is `editorial` desk judgment.
 */
export function mayActAutonomously(mode: AutonomyMode, suggestionClass: string): boolean {
  if (mode === 'auto-fix-defects') return suggestionClass === 'defect';
  if (mode === 'auto-tune') return suggestionClass === 'defect' || suggestionClass === 'friction';
  return false;
}

/** Whether a card should be raised at all. `digest-only` means "leave me alone". */
export function wantsSuggestions(mode: AutonomyMode): boolean {
  return mode !== 'digest-only';
}

/**
 * The budget, from the plan: at most 2 autonomous starts a day across the platform, and
 * at most one per game per week.
 *
 * Two ceilings because they bound different failures. The global one bounds cost — agent
 * runs are the expensive resource, and a router bug that suddenly finds forty defects
 * should cost two runs, not forty. The per-game one bounds *nuisance*: a game that keeps
 * routing to defect because its evidence is genuinely bad would otherwise be rebuilt every
 * night, and its creator would watch the platform thrash on their game unasked.
 *
 * Creator approvals are not counted here. Those already spend the `improvements` quota,
 * and someone deciding to spend their own allowance is not the thing this bounds.
 */
export const AUTONOMY_BUDGET = {
  perDayGlobal: 2,
  perGamePerWeek: 1,
};

/** Marks work the platform started on its own, so a budget read can tell it apart. */
export const AUTONOMOUS_ACTOR = 'system:autonomy';

export interface BudgetInput {
  /** Every suggestion already decided, so spend is derived rather than separately counted. */
  decided: SuggestionRecord[];
  slug: string;
  now: number;
  budget?: typeof AUTONOMY_BUDGET;
}

/**
 * Whether one more autonomous start is allowed, and if not, which ceiling stopped it.
 *
 * Spend is derived from the suggestions themselves rather than kept in a counter. A
 * counter would be a second source of truth that can drift from the work it claims to
 * describe — and the question "how many did we start today" is exactly answerable from
 * the records that say when each one was started and by whom.
 */
export function budgetVerdict(input: BudgetInput): { allowed: true } | { allowed: false; reason: string } {
  const budget = input.budget ?? AUTONOMY_BUDGET;
  const autonomous = input.decided.filter((record) => record.decidedBy === AUTONOMOUS_ACTOR && record.decidedAt);

  const startedSince = (record: SuggestionRecord): number => input.now - Date.parse(record.decidedAt!);

  const today = autonomous.filter((record) => {
    const age = startedSince(record);
    return Number.isFinite(age) && age >= 0 && age < 86_400_000;
  });
  if (today.length >= budget.perDayGlobal) {
    return { allowed: false, reason: `global daily autonomy budget spent (${budget.perDayGlobal})` };
  }

  const thisGame = autonomous.filter((record) => {
    if (record.slug !== input.slug) return false;
    const age = startedSince(record);
    return Number.isFinite(age) && age >= 0 && age < 7 * 86_400_000;
  });
  if (thisGame.length >= budget.perGamePerWeek) {
    return { allowed: false, reason: `this game already had autonomous work this week` };
  }

  return { allowed: true };
}
