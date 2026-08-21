// Round-0 draft availability for MCP / build-channel agents.

// Every notice names get_sources: the draft is the round's sources.

// Tri-state, not boolean: "not yet" must never read as "never".

import type { JobSeedOutcome, SubmissionRecord } from './store.js';

// The half of a draft this needs; full shape in game-seed.
interface SeedAttemptDraft {
  references: string[];
  elapsedMs: number;
  compiles: boolean;
  repaired: boolean;
  usage?: { provider?: string; model?: string };
}

export const SEED_STATUSES = ['pending', 'available', 'unavailable'] as const;
export type SeedStatus = (typeof SEED_STATUSES)[number];

export function resolveSeedStatus(record: Pick<SubmissionRecord, 'seed' | 'seedStatus'>): SeedStatus {
  if (record.seed) return 'available';
  if (record.seedStatus === 'pending') return 'pending';
  return 'unavailable';
}

// Imperative status copy for start / brief / sources.
export function seedNoticeFor(status: SeedStatus): string | null {
  switch (status) {
    case 'available':
      return 'This game already has sources — a generated round-0 draft. Call get_sources now and continue those files; do not scaffold from scratch. The brief wins: delete anything in the draft that contradicts it rather than adapting the spec to the draft.';
    case 'pending':
      return "This game's round-0 draft is still generating. Browse the kit if needed, then call get_sources again before scaffolding.";
    default:
      return 'This round has no draft to continue; scaffold from a kit starter — with a shell, `npm run create -- <slug> "Title" [--like <starter>]`; without one, read starters/<slug>/ via read_kit_file and stage those files.';
  }
}

export function seedPayload(record: Pick<SubmissionRecord, 'seed' | 'seedStatus'>): {
  seedAvailable: boolean;
  seedStatus: SeedStatus;
  seedNotice: string | null;
} {
  const seedStatus = resolveSeedStatus(record);
  return {
    seedAvailable: seedStatus === 'available',
    seedStatus,
    seedNotice: seedNoticeFor(seedStatus),
  };
}

// What to record about one round-0 attempt; null when there was none.

// Failures included: an unplaced draft and an ungenerated one read the same.
export function seedOutcomeFor(input: {
  attempt: { draft?: SeedAttemptDraft; reason?: string; provider?: string } | undefined;
  placed: boolean;
  at: string;
}): JobSeedOutcome | null {
  const { attempt } = input;
  if (!attempt) return null;
  if (!attempt.draft) {
    // Environment and operator facts, not round-0 faults: an operator-chosen "off" must
    // never count toward detectSeedingDegraded the way an actual generation failure does.
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
