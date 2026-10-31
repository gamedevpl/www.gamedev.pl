// Credits gone, not a short 429. The outage alert matches this.
export const MODERATION_BILLING_EXHAUSTED_MSG = 'moderation billing exhausted';

// Fail-closed console prefix. The outage alert matches this text.
export const MODERATION_FAILED_CLOSED_PREFIX = 'Moderation failed or timed out';

// One JSON line so Cloud Logging can promote severity and msg.
export function logModerationBillingExhausted(provider: string): void {
  console.error(
    JSON.stringify({
      severity: 'ERROR',
      message: MODERATION_BILLING_EXHAUSTED_MSG,
      msg: MODERATION_BILLING_EXHAUSTED_MSG,
      provider,
    }),
  );
}
