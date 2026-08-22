// Which preflight check refused a delivery.
export const PREFLIGHT_KINDS = ['audio', 'symbols', 'typecheck'] as const;
export type PreflightKind = (typeof PREFLIGHT_KINDS)[number];
