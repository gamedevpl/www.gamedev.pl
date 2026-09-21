// What a shelf-relevant write costs, which the read ratchet cannot see.

// #1416 deferred this: reads got cheap, writes were never measured.

import { FirestoreStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

export const OWNER_UID = 'g:writer';
export const EDITOR_UID = (index: number) => `g:co-editor-${index}`;
export const AT = '2026-01-15T12:00:00.000Z';

export interface OwnerShape {
  rounds: number;
  games: number;
  // Co-editors on the game the measured write targets.
  editors: number;
}

// Each shape moves one dimension, so each slope stands alone.

// A round-per-game seed would report both as one number.
export const LIGHT: OwnerShape = { rounds: 3, games: 3, editors: 0 };
export const HEAVY_ROUNDS: OwnerShape = { rounds: 24, games: 3, editors: 0 };
export const HEAVY_GAMES: OwnerShape = { rounds: 24, games: 24, editors: 0 };
// The first editor costs more; seal the steps apart.
export const SHARED_ONE: OwnerShape = { rounds: 24, games: 3, editors: 1 };
export const HEAVY_EDITORS: OwnerShape = { rounds: 24, games: 3, editors: 12 };

export const MEASURED_SHAPES: readonly OwnerShape[] = [
  LIGHT,
  HEAVY_ROUNDS,
  HEAVY_GAMES,
  SHARED_ONE,
  HEAVY_EDITORS,
];

export interface Axis {
  name: string;
  dimension: 'rounds' | 'games' | 'editors';
  from: OwnerShape;
  to: OwnerShape;
}

// Sealed like totals: the slope is what this gate exists for.
export const MEASURED_AXES: readonly Axis[] = [
  { name: 'round', dimension: 'rounds', from: LIGHT, to: HEAVY_ROUNDS },
  { name: 'game', dimension: 'games', from: HEAVY_ROUNDS, to: HEAVY_GAMES },
  // One step: the fixed cost of becoming shared.
  { name: 'sharing', dimension: 'editors', from: HEAVY_ROUNDS, to: SHARED_ONE },
  // Both ends shared: the marginal member.
  { name: 'editor', dimension: 'editors', from: SHARED_ONE, to: HEAVY_EDITORS },
];

export function shapeLabel(shape: OwnerShape): string {
  return `${shape.rounds} rounds, ${shape.games} games, ${shape.editors} editors`;
}

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
  return `${operation} (${shapeLabel(shape)}) ${metric}`;
}

export function slopeLabel(operation: MeasuredOperation, axis: Axis, metric: 'reads' | 'writes'): string {
  return `${operation} (per ${axis.name}) ${metric}`;
}

// Two decimals: a slope need not be whole.
export function slopeOf(
  measured: Record<string, number>,
  operation: MeasuredOperation,
  axis: Axis,
  metric: 'reads' | 'writes',
): number {
  const from = measured[costLabel(operation, axis.from, metric)] ?? 0;
  const to = measured[costLabel(operation, axis.to, metric)] ?? 0;
  const steps = axis.to[axis.dimension] - axis.from[axis.dimension];
  return Math.round(((to - from) / steps) * 100) / 100;
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

// Through invite and accept, so access looks as it would in production.
async function seedEditors(store: Store, slug: string, editors: number): Promise<void> {
  for (let index = 0; index < editors; index += 1) {
    const uid = EDITOR_UID(index);
    await store.upsertUser({ uid });
    const invite = await store.createEditorInvitation(slug, OWNER_UID, uid, AT);
    if (typeof invite === 'string') throw new Error(`could not invite ${uid}: ${invite}`);
    const accepted = await store.acceptEditorInvitation(slug, uid, AT, invite.inviteId);
    if (accepted === null || typeof accepted === 'string') throw new Error(`could not add ${uid}: ${String(accepted)}`);
  }
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
  await seedEditors(store, `game-${(shape.rounds - 1) % shape.games}`, shape.editors);
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
  return { label: `${operation} (${shapeLabel(shape)})`, reads: fake.billedReads(), writes: fake.billedWrites() };
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
  // Recorded, so a slope cannot grow under unchanged totals.
  for (const operation of MEASURED_OPERATIONS) {
    for (const axis of MEASURED_AXES) {
      for (const metric of ['reads', 'writes'] as const) {
        measured[slopeLabel(operation, axis, metric)] = slopeOf(measured, operation, axis, metric);
      }
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
