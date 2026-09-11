// Automation's own daily ceiling, shared by the gates.

// Well above any legitimate sweep; finite all the same.
export const DEFAULT_GLOBAL_DAILY_BOT_CALL_CAP = 5000;

export function resolveDefaultGlobalDailyBotCallCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.GLOBAL_DAILY_BOT_CALL_CAP?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_GLOBAL_DAILY_BOT_CALL_CAP;
}
