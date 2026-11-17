import { z } from 'zod';
import type { ManagedProviderConfig } from './managed-agent.js';
import { activityEvidence } from './managed-activity-evidence.js';
import { summarizeActivity, type ActivitySummary } from './managed-activity-summary.js';

const ManagedActivitySchema = z.object({
  at: z.iso.datetime({ offset: true }),
  key: z.enum([
    'managed_reading_files',
    'managed_editing_files',
    'managed_running_commands',
    'managed_using_tools',
    'managed_working',
    'managed_idle',
    'managed_ended',
  ]),
});
export type ManagedActivity = z.infer<typeof ManagedActivitySchema> & { summary?: ActivitySummary };

const EVENT_TYPES = [
  'agent.tool_use',
  'agent.tool_result',
  'agent.mcp_tool_use',
  'span.model_request_start',
  'session.status_running',
  'session.status_idle',
  'session.status_terminated',
];

// Neither arguments, results, model prose nor reasoning leave this adapter.
export function managedActivityFromEvent(value: unknown): ManagedActivity | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  let key: ManagedActivity['key'];
  switch (event.type) {
    case 'agent.tool_use':
      key =
        event.name === 'bash'
          ? 'managed_running_commands'
          : ['read', 'grep', 'glob', 'ls'].includes(String(event.name))
            ? 'managed_reading_files'
            : ['write', 'edit', 'multi_edit'].includes(String(event.name))
              ? 'managed_editing_files'
              : 'managed_using_tools';
      break;
    case 'agent.mcp_tool_use':
      key = 'managed_using_tools';
      break;
    case 'session.status_idle':
      key = 'managed_idle';
      break;
    case 'session.status_terminated':
      key = 'managed_ended';
      break;
    case 'span.model_request_start':
    case 'session.status_running':
    case 'agent.tool_result':
      key = 'managed_working';
      break;
    default:
      return null;
  }
  const parsed = ManagedActivitySchema.safeParse({ at: event.processed_at, key });
  return parsed.success ? parsed.data : null;
}

// Concurrent status polls share one bounded vendor read per session.
export function createAnthropicActivityReader(config: ManagedProviderConfig, summarize = summarizeActivity) {
  const cache = new Map<
    string,
    {
      until: number;
      pending: boolean;
      value: Promise<ManagedActivity | null>;
      summarizing: boolean;
      attemptedAt: number;
      through: number;
      summary?: ActivitySummary;
    }
  >();
  return (sessionId: string, since?: string): Promise<ManagedActivity | null> => {
    const key = `${sessionId}:${since ?? ''}`;
    const cached = cache.get(key);
    if (cached && (cached.pending || cached.until > Date.now()))
      return cached.value.then((activity) => withSummary(activity, cached.summary));
    const entry = cached ?? {
      until: 0,
      pending: false,
      value: Promise.resolve(null),
      summarizing: false,
      attemptedAt: -Infinity,
      through: -Infinity,
    };
    entry.until = Date.now() + 5000;
    entry.pending = true;
    entry.value = readLatest(sessionId, since, entry)
      .catch(() => null)
      .finally(() => {
        entry.pending = false;
      });
    if (!cache.has(key) && cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(key, entry);
    return entry.value.then((activity) => withSummary(activity, entry.summary));
  };

  async function readLatest(
    sessionId: string,
    since: string | undefined,
    entry: { summarizing: boolean; attemptedAt: number; through: number; summary?: ActivitySummary },
  ): Promise<ManagedActivity | null> {
    const root = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    const query = new URLSearchParams({ beta: 'true', order: 'desc', limit: '20' });
    for (const type of EVENT_TYPES) query.append('types[]', type);
    const response = await (config.fetchImpl ?? fetch)(
      `${root}/v1/sessions/${encodeURIComponent(sessionId)}/events?${query}`,
      {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'managed-agents-2026-04-01',
        },
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: unknown[] };
    const events = Array.isArray(body.data) ? body.data : [];
    const activity = events.map(managedActivityFromEvent).find((value) => value !== null);
    if (!activity) return null;
    const stopped = activity.key === 'managed_idle' || activity.key === 'managed_ended';
    const recent = activityEvidence(events, since);
    const fresh = recent.filter((event) => Date.parse(event.at) > entry.through);
    const contextIds = new Set(fresh.map((event) => event.toolUseId).filter(Boolean));
    const evidence = recent.filter((event) => fresh.includes(event) || contextIds.has(event.id));
    if (!stopped && !entry.summarizing && evidence.length && Date.now() - entry.attemptedAt >= 30_000) {
      entry.attemptedAt = Date.now();
      entry.through = Math.max(...evidence.map((event) => Date.parse(event.at)));
      // Failed batches are consumed too; polling must not repeat paid failures.
      entry.summarizing = true;
      void Promise.resolve()
        .then(() => summarize(config, evidence))
        .then((summary) => {
          if (summary) entry.summary = summary;
        })
        .catch(() => {})
        .finally(() => {
          entry.summarizing = false;
        });
    }
    return activity;
  }
}

function withSummary(activity: ManagedActivity | null, summary?: ActivitySummary): ManagedActivity | null {
  if (!activity) return null;
  const stopped = activity.key === 'managed_idle' || activity.key === 'managed_ended';
  return {
    ...activity,
    ...(!stopped && summary && Date.now() - Date.parse(summary.at) <= 90_000 ? { summary } : {}),
  };
}
