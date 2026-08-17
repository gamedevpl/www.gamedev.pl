// The fresh party seed wins over a stale retained Studio retry.
export function resolveCreateInitialPrompt(partySeed: string | null, retryPrompt: string | null): string {
  return partySeed ?? retryPrompt ?? '';
}
