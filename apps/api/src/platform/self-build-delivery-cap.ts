// Per-round sources-delivery ceiling for self builds (bounds gate spend).

export const DEFAULT_SELF_BUILD_DELIVERY_CAP = 20;

export function selfBuildDeliveryCap(): number {
  const parsed = Number(process.env.SELF_BUILD_DELIVERY_CAP ?? DEFAULT_SELF_BUILD_DELIVERY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SELF_BUILD_DELIVERY_CAP;
}
