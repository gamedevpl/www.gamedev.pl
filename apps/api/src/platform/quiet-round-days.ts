// How long an open round may sit with no signal from anyone before it closes.

// Same shape as the self-build connect window: the sweep needs it.

export const DEFAULT_QUIET_ROUND_DAYS = 14;

export function quietRoundDays(): number {
  const parsed = Number(process.env.QUIET_ROUND_DAYS ?? DEFAULT_QUIET_ROUND_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_QUIET_ROUND_DAYS;
}
