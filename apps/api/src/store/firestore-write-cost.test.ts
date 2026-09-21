import { describe, expect, it } from 'vitest';
import { loadFirestoreWriteCostBaseline } from '../../../../eslint-rules/firestore-write-cost-lib.mjs';
import {
  HEAVY_EDITORS,
  SHARED_ONE,
  MEASURED_AXES,
  HEAVY_GAMES,
  HEAVY_ROUNDS,
  LIGHT,
  MEASURED_OPERATIONS,
  MEASURED_SHAPES,
  costLabel,
  measureWriteCost,
  slopeLabel,
  slopeOf,
  measureWriteCosts,
} from './firestore-write-cost.fixture.js';

// The read ratchet pins the poll; this pins the write.

// Rounds and games cost separately, so each shape moves one of them.
describe('write path cost baseline', () => {
  it('every measured entry stays at or under its recorded cost', async () => {
    const baseline = loadFirestoreWriteCostBaseline();
    const measured = await measureWriteCosts();
    for (const [label, cost] of Object.entries(measured)) {
      const allowed = baseline.operations[label];
      expect(allowed, `${label} is missing from the baseline`).toEqual(expect.any(Number));
      expect(cost, label).toBeLessThanOrEqual(allowed);
    }
  });

  it('the baseline names nothing the fixture stopped measuring', async () => {
    const baseline = loadFirestoreWriteCostBaseline();
    const measured = await measureWriteCosts();
    for (const label of Object.keys(baseline.operations)) {
      expect(measured, `${label} is in the baseline but not measured`).toHaveProperty(label);
    }
  });

  // The control: claimSeal tombstones, so history cannot cost it.
  it('claimSeal costs the same whatever the owner already owns', async () => {
    const light = await measureWriteCost('claimSeal', LIGHT);
    const rounds = await measureWriteCost('claimSeal', HEAVY_ROUNDS);
    const games = await measureWriteCost('claimSeal', HEAVY_GAMES);
    for (const heavy of [rounds, games]) {
      expect(heavy.reads, heavy.label).toBe(light.reads);
      expect(heavy.writes, heavy.label).toBe(light.writes);
    }
  });

  // Members are not history: each has a shelf to go stale.
  it('claimSeal reads nothing extra for co-editors, and tombstones each', async () => {
    const alone = await measureWriteCost('claimSeal', HEAVY_ROUNDS);
    const shared = await measureWriteCost('claimSeal', HEAVY_EDITORS);
    expect(shared.reads).toBe(alone.reads);
    expect(shared.writes - alone.writes).toBe(HEAVY_EDITORS.editors);
  });

  // One slope would average two different costs.
  it('seals becoming shared apart from the marginal editor', async () => {
    const alone = await measureWriteCost('setSubmissionTitle', HEAVY_ROUNDS);
    const one = await measureWriteCost('setSubmissionTitle', SHARED_ONE);
    const many = await measureWriteCost('setSubmissionTitle', HEAVY_EDITORS);
    const sharing = one.reads - alone.reads;
    const marginal = (many.reads - one.reads) / (HEAVY_EDITORS.editors - SHARED_ONE.editors);
    // The owner query stops covering access; no later member repeats it.
    expect(sharing).toBeGreaterThan(marginal);
  });

  // One game per round would report the two slopes added together.
  it('separates what a round costs from what a game costs', async () => {
    const light = await measureWriteCost('setSubmissionTitle', LIGHT);
    const rounds = await measureWriteCost('setSubmissionTitle', HEAVY_ROUNDS);
    const games = await measureWriteCost('setSubmissionTitle', HEAVY_GAMES);
    const perRound = (rounds.reads - light.reads) / 21;
    const perGame = (games.reads - rounds.reads) / 21;
    expect(perRound).toBe(1);
    expect(perGame).toBe(2);
  });

  // A seed of one lone owner would record none of this.
  it('charges a setter for every co-editor of the game it touches', async () => {
    const alone = await measureWriteCost('setSubmissionTitle', HEAVY_ROUNDS);
    const shared = await measureWriteCost('setSubmissionTitle', HEAVY_EDITORS);
    expect(shared.reads).toBeGreaterThan(alone.reads);
    expect(shared.writes - alone.writes).toBe(HEAVY_EDITORS.editors);
  });

  // An always-zero counter would satisfy every ceiling above.
  it('counts the writes each operation actually bills', async () => {
    const measured = await measureWriteCosts();
    // Slope entries share the suffix and are legitimately zero.
    const writes = Object.entries(measured).filter(([label]) => label.endsWith(' writes') && !label.includes(' (per '));
    expect(writes).toHaveLength(MEASURED_OPERATIONS.length * MEASURED_SHAPES.length);
    for (const [label, cost] of writes) expect(cost, label).toBeGreaterThan(0);
    // The source write plus the tombstone it forces.
    expect(measured[costLabel('setSubmissionTitle', LIGHT, 'writes')]).toBe(2);
    // One source write, then the guard tombstones twice: in-transaction and deferred.
    expect(measured[costLabel('claimSeal', LIGHT, 'writes')]).toBe(3);
  });

  // A total ceiling alone misses a slope that grew as overhead shrank.
  it('seals the slopes, not only the totals they come from', async () => {
    const baseline = loadFirestoreWriteCostBaseline();
    const measured = await measureWriteCosts();
    for (const operation of MEASURED_OPERATIONS) {
      for (const axis of MEASURED_AXES) {
        for (const metric of ['reads', 'writes'] as const) {
          const label = slopeLabel(operation, axis, metric);
          expect(baseline.operations, `${label} is not sealed`).toHaveProperty(label);
          // Against the totals in the same run, so a stuck recorder fails.
          expect(measured[label], label).toBe(slopeOf(measured, operation, axis, metric));
          expect(measured[label], label).toBeLessThanOrEqual(baseline.operations[label]);
        }
      }
    }
  });

  // The regression a totals-only gate would pass: overhead down, slope up.
  it('reads a steeper slope even when both totals shrank', () => {
    const totals = {
      'setSubmissionTitle (3 rounds, 3 games, 0 editors) reads': 4,
      'setSubmissionTitle (24 rounds, 3 games, 0 editors) reads': 33,
    };
    expect(slopeOf(totals, 'setSubmissionTitle', MEASURED_AXES[0]!, 'reads')).toBeGreaterThan(1);
  });

  // Guards the labels the baseline and the slope report are keyed on.
  it('labels a measurement by operation, shape and metric', () => {
    expect(costLabel('claimSeal', LIGHT, 'reads')).toBe('claimSeal (3 rounds, 3 games, 0 editors) reads');
  });
});
