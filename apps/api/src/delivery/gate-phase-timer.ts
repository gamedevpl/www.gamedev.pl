// Where a paid gate run's minutes actually go.

export interface GatePhaseTimer {
  time<T>(name: string, work: () => Promise<T>): Promise<T>;
  // Phase seconds, plus `rest=` for everything else in runGate.
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
        // Accumulated across calls; clamped per phase, not just in the total.
        phaseMs.set(name, (phaseMs.get(name) ?? 0) + Math.max(0, now() - startedAt));
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
      parts.push(`rest=${seconds(Math.max(0, totalMs - measured))}`);
      return parts.join(' ');
    },
  };
}
