import { describe, expect, it, vi } from 'vitest';
import { GATE_RUN_UID, withGateRunCeiling } from './gate-run-ceiling.js';

const now = () => Date.parse('2026-09-04T10:00:00.000Z');

describe('gate-run ceiling', () => {
  it('starts the build and counts it, once per call', async () => {
    const trigger = vi.fn(async () => ({ buildId: 'build-1' }));
    const spend = vi.fn(async () => ({ allowed: true }));
    const wrapped = withGateRunCeiling(trigger, { checkAndSpend: spend }, { now });

    expect(await wrapped!({ slug: 'g', version: 'v1' })).toEqual({ buildId: 'build-1' });
    expect(spend).toHaveBeenCalledWith(GATE_RUN_UID, '2026-09-04');
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('starts nothing once the day is spent, whichever entry point asked', async () => {
    const trigger = vi.fn(async () => ({ buildId: 'build-1' }));
    const warnings: string[] = [];
    const wrapped = withGateRunCeiling(
      trigger,
      { checkAndSpend: async () => ({ allowed: false }) },
      { now, logWarn: (_payload, message) => warnings.push(message) },
    );

    // Shaped like a trigger that could not start: unverified, never published.
    expect(await wrapped!({ slug: 'g', version: 'v1' })).toBeUndefined();
    expect(trigger).not.toHaveBeenCalled();
    expect(warnings[0]).toContain('gate-run ceiling');
  });

  it('leaves an unconfigured trigger unconfigured', () => {
    expect(withGateRunCeiling(undefined, { checkAndSpend: async () => ({ allowed: true }) })).toBeUndefined();
  });
});
