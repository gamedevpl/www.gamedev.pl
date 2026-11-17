import type { SubmissionStatus } from './submissionApi.js';
import { presenceThought, presenceThoughtLabel } from './surfaces/studio/presenceThought.js';

export function welcomeActivityMessage(status: SubmissionStatus, t: (key: string) => string): string | null {
  const live = status.lastAgentPresence;
  const latest = Math.max(0, ...(status.events ?? []).map((event) => Date.parse(event.createdAt)));
  if (!live?.key.startsWith('managed_') || Date.parse(live.at) < latest) return null;
  const thought = presenceThought(status);
  if (thought) return presenceThoughtLabel(thought, t);
  return ['managed_idle', 'managed_ended'].includes(live.key) ? t(`statusView.presence.${live.key}`) : null;
}
