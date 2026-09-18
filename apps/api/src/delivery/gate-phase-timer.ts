// Where a paid gate run's minutes actually go.

export interface GatePhaseTimer {
  time<T>(name: string, work: () => Promise<T>): Promise<T>;
  // Phase seconds plus a `check=` remainder.
  summary(totalMs: number): string;
}

export function createGatePhaseTimer(now: () => number = Date.now): GatePhaseTimer {
  const phaseMs = new Map<string, number>();
  return {
    async time(name, work) {
      const startedAt = now();
      try {
        return await work();
      } finally {
        // Accumulated, not overwritten: a phase may run once per harness.
        phaseMs.set(name, (phaseMs.get(name) ?? 0) + (now() - startedAt));
      }
    },
    summary(totalMs) {
      const seconds = (ms: number) => `${Math.round(ms / 1000)}s`;
      let measured = 0;
      const parts: string[] = [];
      for (const [name, ms] of phaseMs) {
        measured += ms;
        parts.push(`${name}=${seconds(ms)}`);
      }
      // Never negative: clock skew must not read as nonsense.
      parts.push(`check=${seconds(Math.max(0, totalMs - measured))}`);
      return parts.join(' ');
    },
  };
}
