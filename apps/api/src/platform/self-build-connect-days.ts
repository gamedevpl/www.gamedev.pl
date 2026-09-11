// How long a silent self round waits before it is auto-abandoned.

// Split out like the delivery cap: the sweep needs it.

export const DEFAULT_SELF_BUILD_CONNECT_DAYS = 14;

export function selfBuildConnectDays(): number {
  const parsed = Number(process.env.SELF_BUILD_CONNECT_DAYS ?? DEFAULT_SELF_BUILD_CONNECT_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SELF_BUILD_CONNECT_DAYS;
}
