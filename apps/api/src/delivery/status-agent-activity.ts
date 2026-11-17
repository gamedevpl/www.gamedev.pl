import type { SubmissionRecord } from '../platform/store.js';
import type { SubmissionStatusResponse } from '../platform/submission-status.js';
import type { AgentActivity } from '../agent-surface/agent-backend.js';

export type ReadAgentActivity = (backend: string, ref: string, since: string) => Promise<AgentActivity | null>;

export function applyRoundStartSignal(status: SubmissionStatusResponse, record: SubmissionRecord): void {
  if (
    status.status === 'queued' &&
    !record.abandonedAt &&
    !record.agentEndedAt &&
    ['queued', 'dispatched', 'building'].includes(record.state ?? 'queued') &&
    Date.parse(record.lastAgentSignalAt ?? '') >= Date.parse(record.roundStartedAt ?? record.createdAt)
  ) {
    status.status = 'building';
    status.phase = 'building';
  }
}

// Activity shares the progress response; it never becomes a chat message.
export async function attachAgentActivity(
  status: SubmissionStatusResponse,
  record: SubmissionRecord,
  read: ReadAgentActivity | undefined,
  now: () => number,
  locale = 'en',
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
  const activity = await read(record.dispatch.backend, ref, record.roundStartedAt ?? record.createdAt).catch(
    () => null,
  );
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
  status.lastAgentPresence = { key: activity.key, at: activity.at };
  const summary = activity.summary;
  const latestReport = Math.max(0, ...(status.events ?? []).map((event) => Date.parse(event.createdAt)));
  if (
    !stopped &&
    summary &&
    Date.parse(summary.at) <= now() + 5000 &&
    Date.parse(summary.at) >=
      Math.max(
        latestReport,
        Date.parse(record.lastAgentSignalAt ?? '') || 0,
        Date.parse(record.roundStartedAt ?? record.createdAt),
      ) &&
    now() - Date.parse(summary.at) <= 90_000
  ) {
    status.lastAgentPresence.text = locale.startsWith('pl') ? summary.pl : summary.en;
    status.lastAgentPresence.textAt = summary.at;
  }
  status.lastAgentSignalAt = activity.at;
  if (!stopped) {
    if (status.status === 'queued') {
      status.status = 'building';
      status.phase = 'building';
    }
    if (status.stall === 'quiet') delete status.stall;
  }
}
