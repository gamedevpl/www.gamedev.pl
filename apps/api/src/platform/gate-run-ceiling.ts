// The daily ceiling on gate builds, wrapped around the trigger itself.

// Six entry points start builds; gating each one leaves the next unbounded.

// A refusal reads as a trigger that could not start.

// Structural, so platform wires the ceiling without importing creation.
export interface GateRunCeiling {
  checkAndSpend(uid: string, dateStr: string): Promise<{ allowed: boolean }>;
}

// Not a bot uid: a build is platform money regardless.
export const GATE_RUN_UID = 'platform:gate-run';

export interface GateRunCeilingOptions {
  now?: () => number;
  logWarn?: (payload: Record<string, unknown>, message: string) => void;
}

// Wraps a trigger so no entry point starts an uncounted build.
export function withGateRunCeiling<TInput, TResult>(
  trigger: ((input: TInput) => TResult | Promise<TResult>) | undefined,
  gate: GateRunCeiling | null | undefined,
  options: GateRunCeilingOptions = {},
): ((input: TInput) => Promise<TResult | undefined>) | undefined {
  if (!trigger) return undefined;
  // No ceiling configured: local development, behaviour unchanged.
  if (!gate) return async (input: TInput) => trigger(input);
  const now = options.now ?? Date.now;

  return async (input: TInput) => {
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    const spent = await gate.checkAndSpend(GATE_RUN_UID, dateStr);
    if (!spent.allowed) {
      options.logWarn?.({ input, dateStr }, 'daily gate-run ceiling reached; candidate left unverified');
      return undefined;
    }
    return trigger(input);
  };
}
