import type { SubmissionStatus } from './submissionApi.js';

// Prefer live agent words over canned labels.
export function welcomeProgressMessage(status: SubmissionStatus | null, translate: (key: string) => string): string {
  if (!status) return translate('welcome.loading');

  // Newest-first from API; sort by createdAt if order drifts.
  const latest = [...(status.events ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (latest?.text?.trim()) return latest.text.trim();

  const note = status.progress?.note?.trim();
  if (note) return note;

  const presenceKey = status.lastAgentPresence?.key;
  if (presenceKey) {
    const presence = translate(`statusView.presence.${presenceKey}`);
    if (presence && !presence.startsWith('statusView.presence.')) return presence;
  }

  if (status.phase === 'dispatched') {
    return translate('statusView.phases.dispatched');
  }
  if (status.phase === 'submitted') {
    return translate('statusView.phases.submitted');
  }
  if (status.phase === 'ready_for_review') {
    return translate('statusView.phases.ready_for_review');
  }

  return translate(`statusView.states.${status.status}.description`);
}

export function welcomeStatusLabel(status: SubmissionStatus | null, translate: (key: string) => string): string {
  if (!status) return translate('welcome.loading');
  if (status.phase === 'dispatched') {
    return translate('statusView.phaseLabels.dispatched');
  }
  return translate(`statusView.states.${status.status}.label`);
}
