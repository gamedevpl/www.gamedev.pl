import type { SubmissionStatus } from './submissionApi.js';
import { isManagedStop, presenceThought, presenceThoughtLabel } from './surfaces/studio/presenceThought.js';

export function welcomeActivityMessage(status: SubmissionStatus, t: (key: string) => string): string | null {
  const live = status.lastAgentPresence;
  const latest = Math.max(0, ...(status.events ?? []).map((event) => Date.parse(event.createdAt)));
  if (!live?.key.startsWith('managed_') || isManagedStop(live.key)) return null;
  const thought = presenceThought(status);
  if (!thought || thought.at < latest || (!thought.text && Date.now() - latest < 30_000)) return null;
  return presenceThoughtLabel(thought, t);
}

export function silentStart(status: SubmissionStatus): boolean {
  return status.phase === 'building' && status.lastAgentPresence?.key === 'joining_round' && !presenceThought(status);
}
