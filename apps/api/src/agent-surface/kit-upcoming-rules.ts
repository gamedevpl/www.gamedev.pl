/**
 * Delivery rules that are announced before they are enforced.
 *
 * A rule landing with the engine pin is abrupt: the previous green gate ran an older
 * engine, submitting against that older `kitEngineRef` fails with
 * `kit_engine_ref_mismatch`, and at a tight byte budget every fix competes with the
 * budget. `get_kit` carries this list so a build can absorb a rule on its own
 * schedule. Add an entry when a rule is decided, remove it once it is enforced.
 */
export interface UpcomingRule {
  /** Stable id an agent can match on, e.g. `no-any`. */
  id: string;
  /** One line: what the rule refuses, and what to do instead. */
  summary: string;
}

export const KIT_UPCOMING_RULES: readonly UpcomingRule[] = [];
