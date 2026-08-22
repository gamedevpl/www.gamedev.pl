// Which lane a source delivery was made into.
export const DELIVERY_MODES = ['preview', 'publish', 'proposal'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
