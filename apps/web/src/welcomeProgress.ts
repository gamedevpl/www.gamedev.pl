import type { SubmissionStatus } from './submissionApi.js';
import { welcomeActivityMessage } from './welcomeActivityMessage.js';

export function welcomeProgressMessage(status: SubmissionStatus | null, translate: (key: string) => string): string {
  if (!status) return translate('welcome.loading');

  const latest = [...(status.events ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const activity = welcomeActivityMessage(status, translate);
  if (activity) return activity;
  if (latest?.text?.trim()) return latest.text.trim();

  const note = status.progress?.note?.trim();
  if (note) return note;

  const presenceKey = status.lastAgentPresence?.key;
  if (presenceKey) {
    const presence = translate(`statusView.presence.${presenceKey}`);
    if (presence && !presence.startsWith('statusView.presence.')) return presence;
  }

  if (['dispatched', 'submitted', 'ready_for_review'].includes(status.phase ?? '')) {
    return translate(`statusView.phases.${status.phase}`);
  }

  return translate(`statusView.states.${status.status}.description`);
}

export function welcomeStatusLabel(status: SubmissionStatus | null, translate: (key: string) => string): string {
  if (!status) return translate('welcome.loading');
  if (['managed_idle', 'managed_ended'].includes(status.lastAgentPresence?.key ?? '')) {
    return translate(`statusView.presence.${status.lastAgentPresence!.key}`);
  }
  if (status.phase === 'dispatched') {
    return translate('statusView.phaseLabels.dispatched');
  }
  return translate(`statusView.states.${status.status}.label`);
}
