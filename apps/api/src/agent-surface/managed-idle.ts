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
