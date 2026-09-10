import { describe, expect, it } from 'vitest';
import {
  createDreamAvailabilityGate,
  DEFAULT_GLOBAL_DAILY_DREAM_CAP,
  resolveDefaultGlobalDailyDreamCap,
} from './dream-availability.js';
import { InMemoryStore } from '../platform/store.js';

describe('createDreamAvailabilityGate', () => {
  it('dreams by default and honours the operator pause', async () => {
    const store = new InMemoryStore();
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.dreamingEnabled()).toBe(true);
    await store.setCreationLimits({ dreamsPaused: true }, 'g:boss');
    expect(await gate.dreamingEnabled()).toBe(false);
  });

  it('refuses to dream while the switch has never been read', async () => {
    // An unreadable switch may be a set one; guessing spends real money.
    const store = new InMemoryStore();
    store.getCreationLimits = async () => {
      throw new Error('firestore down');
    };
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.dreamingEnabled()).toBe(false);
    expect(await gate.spendFrameSlots('2026-09-07', 1)).toBe(false);
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(0);
  });

  it('keeps dreaming on a later blip, from the values it did read', async () => {
    const store = new InMemoryStore();
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.dreamingEnabled()).toBe(true);
    store.getCreationLimits = async () => {
      throw new Error('firestore down');
    };
    expect(await gate.dreamingEnabled()).toBe(true);
  });

  it('refuses the frames when the pause landed after the run began', async () => {
    // A live TTL: a cached read would never see the new pause.
    const store = new InMemoryStore();
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.dreamingEnabled()).toBe(true);
    await store.setCreationLimits({ dreamsPaused: true }, 'g:boss');
    expect(await gate.spendFrameSlots('2026-09-07', 2)).toBe(false);
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(0);
  });

  it('falls back to the last known values when the fresh look fails', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyDreamCap: 5 }, 'g:boss');
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.dreamingEnabled()).toBe(true);
    store.getCreationLimits = async () => {
      throw new Error('firestore down');
    };
    expect(await gate.spendFrameSlots('2026-09-07', 1)).toBe(true);
  });

  it('dreams with no store at all, as local runs do', async () => {
    const gate = createDreamAvailabilityGate({});
    expect(await gate.dreamingEnabled()).toBe(true);
    expect(await gate.spendFrameSlots('2026-09-07', 2)).toBe(true);
  });

  it('spends frames against the stored cap and refuses past it', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyDreamCap: 2 }, 'g:boss');
    const warnings: string[] = [];
    const gate = createDreamAvailabilityGate({ store, logWarn: (_p, message) => warnings.push(message) });
    expect(await gate.spendFrameSlots('2026-09-07', 1)).toBe(true);
    expect(await gate.spendFrameSlots('2026-09-07', 1)).toBe(true);
    expect(await gate.spendFrameSlots('2026-09-07', 1)).toBe(false);
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(2);
    expect(warnings.some((message) => message.includes('cap reached'))).toBe(true);
  });

  it('a zero cap refuses without touching the counter', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyDreamCap: 0 }, 'g:boss');
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.spendFrameSlots('2026-09-07', 1)).toBe(false);
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(0);
  });

  it('a counter blip means no frame, unlike a seed', async () => {
    const store = new InMemoryStore();
    store.checkAndIncrementGlobalDreams = async () => {
      throw new Error('firestore down');
    };
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.spendFrameSlots('2026-09-07', 1)).toBe(false);
  });

  it('a pair that does not fit spends nothing', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ globalDailyDreamCap: 3 }, 'g:boss');
    const gate = createDreamAvailabilityGate({ store });
    expect(await gate.spendFrameSlots('2026-09-07', 2)).toBe(true);
    // One slot is left, and a two-frame proposal cannot use it.
    expect(await gate.spendFrameSlots('2026-09-07', 2)).toBe(false);
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(2);
  });

  it('reads the default cap from the environment', () => {
    expect(resolveDefaultGlobalDailyDreamCap({})).toBe(DEFAULT_GLOBAL_DAILY_DREAM_CAP);
    expect(resolveDefaultGlobalDailyDreamCap({ GLOBAL_DAILY_DREAM_CAP: '40' })).toBe(40);
    expect(resolveDefaultGlobalDailyDreamCap({ GLOBAL_DAILY_DREAM_CAP: 'lots' })).toBe(DEFAULT_GLOBAL_DAILY_DREAM_CAP);
  });
});
