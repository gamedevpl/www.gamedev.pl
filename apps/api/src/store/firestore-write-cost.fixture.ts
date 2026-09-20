// What a shelf-relevant write costs, which the read ratchet cannot see.

// #1416 deferred this: reads got cheap, writes were never measured.

import { FirestoreStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

export const OWNER_UID = 'g:writer';
export const EDITOR_UID = 'g:co-editor';
export const AT = '2026-01-15T12:00:00.000Z';

export interface OwnerShape {
  label: string;
  rounds: number;
  games: number;
}

// Each shape moves one dimension, so each slope stands alone.

// A round-per-game seed would report both as one number.
export const LIGHT: OwnerShape = { label: '3 rounds, 3 games', rounds: 3, games: 3 };
export const HEAVY_ROUNDS: OwnerShape = { label: '24 rounds, 3 games', rounds: 24, games: 3 };
export const HEAVY_GAMES: OwnerShape = { label: '24 rounds, 24 games', rounds: 24, games: 24 };

export const MEASURED_SHAPES: readonly OwnerShape[] = [LIGHT, HEAVY_ROUNDS, HEAVY_GAMES];

export const MEASURED_OPERATIONS = [
  'setSubmissionTitle',
  'setSubmissionLastStatus',
  'recordJobTransition',
  'setSubmissionAbandoned',
  'claimSeal',
] as const;

export type MeasuredOperation = (typeof MEASURED_OPERATIONS)[number];

// One entry per operation per shape, so the baseline shows both slopes.
export function costLabel(operation: MeasuredOperation, shape: OwnerShape, metric: 'reads' | 'writes'): string {
  return `${operation} (${shape.label}) ${metric}`;
}

export interface WriteCostRow {
  label: string;
  reads: number;
  writes: number;
}

// The job the write targets; the rest are history.
function jobIdAt(index: number): number {
  return 9000 + index;
}

async function seedOwner(store: Store, shape: OwnerShape): Promise<number> {
  await store.upsertUser({ uid: OWNER_UID });
  for (let index = 0; index < shape.rounds; index += 1) {
    const jobId = jobIdAt(index);
    await store.createSubmission(jobId, OWNER_UID, `Round ${index}`);
    // Rounds share games when there are fewer games than rounds.
    await store.setSubmissionSlug(jobId, `game-${index % shape.games}`);
  }
  const target = jobIdAt(shape.rounds - 1);
  // claimSeal needs a round already offered for review.
  await store.setSubmissionPreviewVersion(target, 'v1');
  await store.recordJobTransition(target, { to: 'ready_for_review', at: AT, by: 'agent', reason: 'delivered' });
  // Warm, as it would be for an owner who polls.
  await store.rebuildShelf(OWNER_UID);
  return target;
}

async function runOperation(store: Store, operation: MeasuredOperation, jobId: number): Promise<void> {
  if (operation === 'setSubmissionTitle') return store.setSubmissionTitle(jobId, 'Renamed');
  if (operation === 'setSubmissionLastStatus') return store.setSubmissionLastStatus(jobId, 'building');
  if (operation === 'recordJobTransition') {
    await store.recordJobTransition(jobId, { to: 'building', at: AT, by: 'creator', reason: 'seal_claimed' });
    return;
  }
  if (operation === 'setSubmissionAbandoned') return store.setSubmissionAbandoned(jobId, AT);
  await store.claimSeal(jobId, AT);
}

export async function measureWriteCost(operation: MeasuredOperation, shape: OwnerShape): Promise<WriteCostRow> {
  const fake = fakeFirestore();
  const store = new FirestoreStore(fake.db);
  const jobId = await seedOwner(store, shape);
  fake.resetBilledReads();
  // afterJobWrite awaits its rebuild, so the store call already drained it.
  await runOperation(store, operation, jobId);
  return { label: `${operation} (${shape.label})`, reads: fake.billedReads(), writes: fake.billedWrites() };
}

export async function measureWriteCosts(): Promise<Record<string, number>> {
  const measured: Record<string, number> = {};
  for (const operation of MEASURED_OPERATIONS) {
    for (const shape of MEASURED_SHAPES) {
      const row = await measureWriteCost(operation, shape);
      measured[costLabel(operation, shape, 'reads')] = row.reads;
      measured[costLabel(operation, shape, 'writes')] = row.writes;
    }
  }
  return measured;
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('firestore-write-cost.fixture.ts') || invoked.endsWith('firestore-write-cost.fixture.js')) {
  measureWriteCosts()
    .then((measured) => {
      process.stdout.write(`${JSON.stringify(measured, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
