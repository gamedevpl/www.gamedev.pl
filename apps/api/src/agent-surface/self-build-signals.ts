export interface SelfBuildSignals {
  lastAgentSignalAt?: string;
  deliveredVersion?: string;
  previewVersion?: string;
  roundDeliveryCount?: number;
}

// A publish from this round; deliveredVersion alone outlives earlier rounds.
export function publishedThisRound(signals: SelfBuildSignals): boolean {
  if ((signals.roundDeliveryCount ?? 0) <= 0 || !signals.deliveredVersion) return false;
  return !signals.previewVersion || signals.previewVersion === signals.deliveredVersion;
}
