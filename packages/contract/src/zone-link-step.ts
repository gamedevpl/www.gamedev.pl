// How far a play session got towards a shared world (P3 zones).
export const ZONE_LINK_STEPS = ['admitted', 'joined', 'lost'] as const;

export type ZoneLinkStep = (typeof ZONE_LINK_STEPS)[number];
