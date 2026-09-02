import type { SubmissionStatus } from '../../submissionApi.js';

// How long a presence thought stays as the headline before falling back.
export const PRESENCE_THOUGHT_MS = 90_000;

// Ambient MCP presence for the live working turn — fresh for PRESENCE_THOUGHT_MS.
export function presenceThought(
  status: SubmissionStatus | null,
  nowMs: number = Date.now(),
): { key: string; at: number } | null {
  const presence = status?.lastAgentPresence;
  if (!presence?.key) return null;
  const at = Date.parse(presence.at);
  if (!Number.isFinite(at) || nowMs - at > PRESENCE_THOUGHT_MS) return null;
  return { key: presence.key, at };
}
