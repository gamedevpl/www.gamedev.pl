// Round-0 draft availability for MCP / build-channel agents.

// Every notice names get_sources: the draft is the round's sources.

// Tri-state, not boolean: "not yet" must never read as "never".

import type { SubmissionRecord } from '../platform/store.js';

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
