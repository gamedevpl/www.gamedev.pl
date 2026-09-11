// What one round-0 seed attempt gets recorded as on the job.

import type { JobSeedOutcome } from './store.js';

// The half of a draft this needs; full shape in game-seed.
interface SeedAttemptDraft {
  references: string[];
  elapsedMs: number;
  compiles: boolean;
  repaired: boolean;
  usage?: { provider?: string; model?: string };
}

// Null when there was no attempt at all.

// Failures included: an unplaced draft and an ungenerated one read the same.
export function seedOutcomeFor(input: {
  attempt: { draft?: SeedAttemptDraft; reason?: string; provider?: string } | undefined;
  placed: boolean;
  at: string;
}): JobSeedOutcome | null {
  const { attempt } = input;
  if (!attempt) return null;
  if (!attempt.draft) {
    // Operator and environment facts, never counted as generation failures.
    if (attempt.reason === 'not_configured' || attempt.reason === 'no_store' || attempt.reason === 'seeding_off') {
      return null;
    }
    return {
      at: input.at,
      generated: false,
      ...(attempt.reason ? { reason: attempt.reason } : {}),
      references: [],
      ms: 0,
      compiles: false,
      repaired: false,
      staged: false,
      ...(attempt.provider ? { provider: attempt.provider } : {}),
    };
  }
  const draft = attempt.draft;
  return {
    at: input.at,
    generated: true,
    references: draft.references,
    ms: draft.elapsedMs,
    compiles: draft.compiles,
    repaired: draft.repaired,
    staged: input.placed,
    ...(draft.usage?.provider ? { provider: draft.usage.provider } : {}),
    ...(draft.usage?.model ? { model: draft.usage.model } : {}),
  };
}
