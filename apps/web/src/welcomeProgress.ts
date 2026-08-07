import type { SubmissionStatus } from './submissionApi.js';

/**
 * One human line for the platform welcome handoff — prefer live agent words over a
 * canned state label. Pure so the screen can stay thin and tests do not need React.
 */
export function welcomeProgressMessage(
  status: SubmissionStatus | null,
  translate: (key: string) => string,
): string {
  if (!status) return translate('welcome.loading');

  const latest = status.events?.[0];
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
  if (status.phase === 'gating') {
    return translate('statusView.phases.gating');
  }
  if (status.phase === 'ready_for_review') {
    return translate('statusView.phases.ready_for_review');
  }

  return translate(`statusView.states.${status.status}.description`);
}

export function welcomeStatusLabel(
  status: SubmissionStatus | null,
  translate: (key: string) => string,
): string {
  if (!status) return translate('welcome.loading');
  if (status.phase === 'dispatched') {
    return translate('statusView.phaseLabels.dispatched');
  }
  return translate(`statusView.states.${status.status}.label`);
}
