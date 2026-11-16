import { z } from 'zod';
import type { ManagedProviderConfig } from './managed-agent.js';

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
export type ManagedActivity = z.infer<typeof ManagedActivitySchema>;

const EVENT_TYPES = [
  'agent.tool_use',
  'agent.mcp_tool_use',
  'span.model_request_start',
  'session.status_running',
  'session.status_idle',
  'session.status_terminated',
  'session.error',
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
    case 'session.error':
      key = 'managed_ended';
      break;
    case 'span.model_request_start':
    case 'session.status_running':
      key = 'managed_working';
      break;
    default:
      return null;
  }
  const parsed = ManagedActivitySchema.safeParse({ at: event.processed_at, key });
  return parsed.success ? parsed.data : null;
}

// Concurrent status polls share one bounded vendor read per session.
export function createAnthropicActivityReader(config: ManagedProviderConfig) {
  const cache = new Map<string, { until: number; value: Promise<ManagedActivity | null> }>();
  return (sessionId: string): Promise<ManagedActivity | null> => {
    const cached = cache.get(sessionId);
    if (cached && cached.until > Date.now()) return cached.value;
    const value = readLatest(sessionId).catch(() => null);
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(sessionId, { until: Date.now() + 5000, value });
    return value;
  };

  async function readLatest(sessionId: string): Promise<ManagedActivity | null> {
    const root = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    const query = new URLSearchParams({ beta: 'true', order: 'desc', limit: '1' });
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
    return managedActivityFromEvent(body.data?.[0]);
  }
}
