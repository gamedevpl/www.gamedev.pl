import type { SubmissionStatus } from '../../submissionApi.js';

// How long a presence thought stays as the headline before falling back.
export const PRESENCE_THOUGHT_MS = 90_000;

export function isManagedStop(key?: string): boolean {
  return key === 'managed_idle' || key === 'managed_ended';
}

// Ambient MCP presence for the live working turn — fresh for PRESENCE_THOUGHT_MS.
export function presenceThought(
  status: SubmissionStatus | null,
  nowMs: number = Date.now(),
): { key: string; at: number; text?: string } | null {
  const presence = status?.lastAgentPresence;
  if (!presence?.key) return null;
  const at = Date.parse(presence.at);
  const age = nowMs - at;
  if (!Number.isFinite(at) || age < -5000) return null;
  if (isManagedStop(presence.key)) return status?.gateProgress ? null : { key: presence.key, at };
  if (age > PRESENCE_THOUGHT_MS) return null;
  const textAt = Date.parse(presence.textAt ?? '');
  if (presence.text && textAt <= nowMs + 5000 && nowMs - textAt <= PRESENCE_THOUGHT_MS)
    return { key: presence.key, at: textAt, text: presence.text };
  return { key: presence.key, at };
}

export function presenceThoughtLabel(thought: { key: string; text?: string }, t: (key: string) => string): string {
  return thought.text ? `${t('statusView.activitySummary')} ${thought.text}` : t(`statusView.presence.${thought.key}`);
}
