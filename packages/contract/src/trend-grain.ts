// Operator telemetry time-series rollup granularity, shared by API and web.
export const TREND_GRAINS = ['day', 'week', 'month'] as const;

export type TrendGrain = (typeof TREND_GRAINS)[number];
