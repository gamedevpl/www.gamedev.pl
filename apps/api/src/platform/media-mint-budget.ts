// Daily ceiling on signed media URLs. See docs/deployment.md "Media egress".

export interface MintBudgetState {
  day: string;
  perIp: Map<string, number>;
  total: number;
}

export interface MintBudgetLimits {
  perIpPerDay: number;
  globalPerDay: number;
}

export const DEFAULT_MINT_BUDGET: MintBudgetLimits = {
  // Thousands a day is a person; tens of thousands is a script.
  perIpPerDay: 5_000,
  globalPerDay: 500_000,
};

export function createMintBudgetState(day: string): MintBudgetState {
  return { day, perIp: new Map(), total: 0 };
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export type MintDecision = 'allowed' | 'ip-exhausted' | 'global-exhausted';

// Counts one mint. The UTC rollover also keeps the map bounded.
export function recordMint(
  state: MintBudgetState,
  ip: string,
  now: number,
  limits: MintBudgetLimits = DEFAULT_MINT_BUDGET,
): { decision: MintDecision; state: MintBudgetState } {
  const day = utcDay(now);
  const current = state.day === day ? state : createMintBudgetState(day);

  if (current.total >= limits.globalPerDay) return { decision: 'global-exhausted', state: current };
  const used = current.perIp.get(ip) ?? 0;
  if (used >= limits.perIpPerDay) return { decision: 'ip-exhausted', state: current };

  current.perIp.set(ip, used + 1);
  current.total += 1;
  return { decision: 'allowed', state: current };
}

export function resolveMintBudget(env: NodeJS.ProcessEnv = process.env): MintBudgetLimits {
  const perIp = Number(env.MEDIA_DAILY_MINTS_PER_IP);
  const global = Number(env.MEDIA_DAILY_MINTS_GLOBAL);
  return {
    perIpPerDay: Number.isFinite(perIp) && perIp > 0 ? perIp : DEFAULT_MINT_BUDGET.perIpPerDay,
    globalPerDay: Number.isFinite(global) && global > 0 ? global : DEFAULT_MINT_BUDGET.globalPerDay,
  };
}
