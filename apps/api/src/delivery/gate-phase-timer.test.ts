import { describe, expect, it } from 'vitest';
import { createGatePhaseTimer } from './gate-phase-timer.js';

function fakeClock(steps: number[]) {
  let index = 0;
  return () => steps[Math.min(index++, steps.length - 1)]!;
}

describe('createGatePhaseTimer', () => {
  it('reports each phase and leaves the rest as the check', async () => {
    const timer = createGatePhaseTimer(fakeClock([0, 12_000, 12_000, 60_000]));

    await timer.time('harnessClone', async () => 'cloned');
    await timer.time('harnessInstall', async () => 'installed');

    expect(timer.summary(300_000)).toBe('harnessClone=12s harnessInstall=48s check=240s');
  });

  it('accumulates a phase that runs more than once', async () => {
    const timer = createGatePhaseTimer(fakeClock([0, 5_000, 5_000, 15_000]));

    await timer.time('harnessInstall', async () => undefined);
    await timer.time('harnessInstall', async () => undefined);

    expect(timer.summary(20_000)).toBe('harnessInstall=15s check=5s');
  });

  it('times a phase that threw, then lets it through', async () => {
    const timer = createGatePhaseTimer(fakeClock([0, 3_000]));

    await expect(timer.time('harnessClone', async () => Promise.reject(new Error('no ref')))).rejects.toThrow('no ref');

    expect(timer.summary(3_000)).toBe('harnessClone=3s check=0s');
  });

  it('never reports a negative check', async () => {
    const timer = createGatePhaseTimer(fakeClock([0, 90_000]));

    await timer.time('harnessInstall', async () => undefined);

    expect(timer.summary(10_000)).toBe('harnessInstall=90s check=0s');
  });
});
