import type { SubmissionRecord } from '../platform/store.js';
import type { SubmissionStatusResponse } from '../platform/submission-status.js';

export type ReadAgentActivity = (backend: string, ref: string) => Promise<{ key: string; at: string } | null>;

// Activity shares the progress response; it never becomes a chat message.
export async function attachAgentActivity(
  status: SubmissionStatusResponse,
  record: SubmissionRecord,
  read: ReadAgentActivity | undefined,
  now: () => number,
): Promise<void> {
  const ref = record.dispatch?.refs.at(-1);
  if (
    !read ||
    !ref ||
    !record.dispatch ||
    record.builder === 'self' ||
    record.abandonedAt ||
    record.agentEndedAt ||
    !['queued', 'dispatched', 'building'].includes(record.state ?? 'queued')
  )
    return;
  const activity = await read(record.dispatch.backend, ref).catch(() => null);
  if (!activity) return;
  const at = Date.parse(activity.at);
  const stopped = activity.key === 'managed_idle' || activity.key === 'managed_ended';
  if (
    !Number.isFinite(at) ||
    at > now() + 5000 ||
    at < Date.parse(record.roundStartedAt ?? record.createdAt) ||
    at < Date.parse(status.lastAgentSignalAt ?? '') ||
    (!stopped && now() - at > 90_000)
  )
    return;
  status.lastAgentPresence = activity;
  status.lastAgentSignalAt = activity.at;
  if (!stopped) {
    if (status.status === 'queued') {
      status.status = 'building';
      status.phase = 'building';
    }
    if (status.stall === 'quiet') delete status.stall;
  }
}
