import { describe, expect, it } from 'vitest';
import { loadFirestoreWriteCostBaseline } from '../../../../eslint-rules/firestore-write-cost-lib.mjs';
import {
  HEAVY_ROUNDS,
  LIGHT_ROUNDS,
  costLabel,
  measureWriteCost,
  measureWriteCosts,
} from './firestore-write-cost.fixture.js';

// The read ratchet pins the poll; this pins the write.

// A cost differing between sizes is paid per round.
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
    const light = await measureWriteCost('claimSeal', LIGHT_ROUNDS);
    const heavy = await measureWriteCost('claimSeal', HEAVY_ROUNDS);
    expect(heavy.reads).toBe(light.reads);
    expect(heavy.writes).toBe(light.writes);
  });

  // Guards the labels the baseline and the slope report are keyed on.
  it('labels a measurement by operation, size and metric', () => {
    expect(costLabel('claimSeal', LIGHT_ROUNDS, 'reads')).toBe(`claimSeal (${LIGHT_ROUNDS} rounds) reads`);
  });
});
