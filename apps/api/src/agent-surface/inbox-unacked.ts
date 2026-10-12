// inbox_unacked: a creator note read_inbox returned but nobody acked.
import type { NudgeWarning } from './mcp-session-nudges.js';

// Unacked, the note stays pending into the next round.
export function unackedWarning(payload: unknown, readIds: ReadonlySet<string>): NudgeWarning | null {
  const list = (payload as { pendingMessages?: unknown } | null)?.pendingMessages;
  if (!Array.isArray(list)) return null;
  const ids = list.map((n: { id?: unknown }) => String(n?.id)).filter((id) => readIds.has(id));
  if (ids.length === 0) return null;
  return {
    code: 'inbox_unacked',
    message: `${ids.length} creator message(s) read_inbox returned are still pending until acknowledged: ${JSON.stringify(ids)}.`,
  };
}
