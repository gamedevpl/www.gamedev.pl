// Maps a failed submission to the message key the creator should see.

// Order matters: three different refusals all answer 429.
export function submissionErrorKey(input: { status?: number; message: string; category?: string }): string {
  const { status, message, category } = input;

  // A session that expired behind the panel; retrying cannot work.
  if (status === 401) return 'errors.signInRequired';

  if (message === 'content_rejected') return `errors.contentRejected.${category ?? 'other'}`;

  // Site limits, not this creator's; the quota branch would be untrue.
  if (message === 'creation_paused') return 'errors.creationPaused';
  if (message === 'creation_over_capacity') return 'errors.creationOverCapacity';

  // Two submissions raced for the address; renaming recovers.
  if (message === 'name_unavailable') return 'errors.nameUnavailable';

  if (message.includes('quota')) return 'auth.quotaExceeded';
  if (message.includes('blocked')) return 'auth.accountBlocked';

  // Last of the 429s; the branches above say something truer.
  if (status === 429) return 'errors.tooManyAttempts';

  // Every other code is a machine string (`dispatch_failed`), never a sentence.
  return 'errors.generic';
}
