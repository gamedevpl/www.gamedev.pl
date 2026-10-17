// Deletes old idle builder sessions so their transcripts do not linger.

import { z } from 'zod';
import { API_VERSION, BETA_HEADER, BETA_QUERY, DEFAULT_BASE_URL } from './managed-provider-anthropic.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PAGES = 50;
const PAGE_LIMIT = 100;
// Running or rescheduling sessions are never touched.
const DELETABLE_STATUSES: ReadonlySet<string> = new Set(['idle', 'terminated']);

const ListedSessionSchema = z.object({
  id: z.string().min(1),
  status: z.string().nullish(),
  created_at: z.string().nullish(),
  environment_id: z.string().nullish(),
  agent: z.union([z.string(), z.object({ id: z.string().nullish() }).passthrough()]).nullish(),
});

const SessionPageSchema = z.object({
  data: z.array(z.unknown()),
  next_page: z.string().nullish(),
});

type ListedSession = z.infer<typeof ListedSessionSchema>;

export interface SessionJanitorConfig {
  apiKey: string;
  agentId: string;
  environmentId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SessionPruneOptions {
  olderThan: Date;
  maxDeletes: number;
  maxPages?: number;
}

export interface SessionPruneResult {
  scanned: number;
  deleted: number;
  failed: number;
  pages: number;
}

export interface ManagedSessionJanitor {
  prune(options: SessionPruneOptions): Promise<SessionPruneResult>;
}

export class SessionRetentionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SessionRetentionError';
  }
}

function agentIdOf(session: ListedSession): string | undefined {
  if (typeof session.agent === 'string') return session.agent;
  return session.agent?.id ?? undefined;
}

export function isDeletableSession(
  session: ListedSession,
  scope: { agentId: string; environmentId: string; olderThan: Date },
): boolean {
  const createdAt = session.created_at ? Date.parse(session.created_at) : Number.NaN;
  if (!Number.isFinite(createdAt) || createdAt >= scope.olderThan.getTime()) return false;
  // The agent alone: the environment may also host hand-run sessions.
  const ours = agentIdOf(session) === scope.agentId;
  return ours && DELETABLE_STATUSES.has(session.status ?? '');
}

export function createAnthropicSessionJanitor(config: SessionJanitorConfig): ManagedSessionJanitor {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = {
    'x-api-key': config.apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-beta': BETA_HEADER,
  };

  // Server-side filters, so recent sessions never use up the page cap.
  async function listPage(cursor: string | undefined, olderThan: Date): Promise<z.infer<typeof SessionPageSchema>> {
    const query = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      agent_id: config.agentId,
      'created_at[lt]': olderThan.toISOString(),
      order: 'asc',
    });
    for (const status of DELETABLE_STATUSES) query.append('statuses', status);
    if (cursor) query.set('page', cursor);
    const response = await fetchImpl(`${baseUrl}/v1/sessions${BETA_QUERY}&${query.toString()}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new SessionRetentionError(`anthropic session list failed: ${response.status}`, response.status);
    }
    const parsed = SessionPageSchema.safeParse(await response.json());
    if (!parsed.success) throw new SessionRetentionError('anthropic session list returned an unreadable page');
    return parsed.data;
  }

  async function deleteSession(id: string): Promise<boolean> {
    try {
      const response = await fetchImpl(`${baseUrl}/v1/sessions/${encodeURIComponent(id)}${BETA_QUERY}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }

  return {
    async prune({ olderThan, maxDeletes, maxPages = DEFAULT_MAX_PAGES }) {
      const result: SessionPruneResult = { scanned: 0, deleted: 0, failed: 0, pages: 0 };
      const scope = { agentId: config.agentId, environmentId: config.environmentId, olderThan };
      let cursor: string | undefined;
      // Attempts, not successes, bound the run so failures cannot loop.
      const budgetLeft = () => result.deleted + result.failed < maxDeletes;
      while (result.pages < maxPages && budgetLeft()) {
        const page = await listPage(cursor, olderThan);
        result.pages++;
        for (const item of page.data) {
          if (!budgetLeft()) break;
          result.scanned++;
          const session = ListedSessionSchema.safeParse(item);
          if (!session.success || !isDeletableSession(session.data, scope)) continue;
          if (await deleteSession(session.data.id)) result.deleted++;
          else result.failed++;
        }
        if (!page.next_page) break;
        cursor = page.next_page;
      }
      return result;
    },
  };
}
