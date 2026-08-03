/**
 * Seed availability for MCP / build-channel agents.
 *
 * Seed generation is async (up to a few minutes) and fail-open. Agents that call
 * get_brief immediately after create_game used to see seedAvailable:false and scaffold
 * from scratch forever. A tri-state status + notice makes "still generating" distinct
 * from "there will be no seed".
 */

import type { SubmissionRecord } from './store.js';

export const SEED_STATUSES = ['pending', 'available', 'unavailable'] as const;
export type SeedStatus = (typeof SEED_STATUSES)[number];

export function resolveSeedStatus(record: Pick<SubmissionRecord, 'seed' | 'seedStatus'>): SeedStatus {
  if (record.seed) return 'available';
  if (record.seedStatus === 'pending') return 'pending';
  return 'unavailable';
}

/** Imperative next-step copy for start / brief / get_seed — null when nothing to do. */
export function seedNoticeFor(status: SeedStatus): string | null {
  switch (status) {
    case 'available':
      return 'Seed draft available: call get_seed now and continue that draft — do not scaffold from scratch.';
    case 'pending':
      return 'Seed draft is still generating. Browse the kit if needed, then call get_seed again before scaffolding from a template.';
    default:
      return null;
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
