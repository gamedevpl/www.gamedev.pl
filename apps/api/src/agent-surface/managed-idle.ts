// Managed-session idle states Studio cannot resolve by nudging.

// Idle requires_action: tool_confirmation Studio cannot Approve.
export function isManagedIdleBlockedOnAction(stopReason: string | undefined): boolean {
  return stopReason === 'requires_action';
}

// Nudge 400 while waiting on tool_confirmation.
export function isUnnudgeableManagedIdleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /tool_confirmation|requires_action|waiting for.*confirmation/i.test(message);
}

// Explicit end() since startedMs; submit/takeover markers do not count.
export function endedExplicitlySince(
  signals: { agentEndedAt?: string; agentEndedBy?: string } | null,
  startedMs: number,
): boolean {
  const by = signals?.agentEndedBy;
  if (!signals?.agentEndedAt || by === 'submit' || by === 'takeover') return false;
  return Date.parse(signals.agentEndedAt) >= startedMs;
}
