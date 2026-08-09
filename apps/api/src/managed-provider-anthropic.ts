// Anthropic Managed Agents adapter; the only vendor-shaped file.
import { z } from 'zod';
import {
  ManagedAgentError,
  normalizeManagedState,
  registerManagedProvider,
  type ManagedAgentProvider,
  type ManagedOutputRef,
  type ManagedProviderConfig,
  type ManagedSession,
  type ManagedSessionRequest,
} from './managed-agent.js';

export const ANTHROPIC_VENDOR = 'anthropic';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_TIMEOUT_MS = 30_000;
const API_VERSION = '2023-06-01';

const BETA_HEADER = 'managed-agents-2026-04-01';

const UsageSchema = z
  .object({
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
    cache_read_input_tokens: z.number().nonnegative().optional(),
    cache_creation_input_tokens: z.number().nonnegative().optional(),
  })
  .partial();

const SessionSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  model: z.string().optional(),
  created_at: z.string().optional(),
  ended_at: z.string().optional(),
  stop_reason: z.object({ type: z.string().optional() }).optional(),
  usage: UsageSchema.optional(),
});

const FileListSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        filename: z.string().optional(),
        size_bytes: z.number().nonnegative().optional(),
      }),
    )
    .default([]),
});

function toSession(parsed: z.infer<typeof SessionSchema>): ManagedSession {
  const usage = parsed.usage;
  // Cache reads are input tokens too.
  const inputTokens =
    (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);
  const outputTokens = usage?.output_tokens ?? 0;
  const hasUsage = usage !== undefined;
  return {
    id: parsed.id,
    state: normalizeManagedState(parsed.status),
    ...(parsed.status ? { vendorState: parsed.status } : {}),
    ...(hasUsage ? { usage: { inputTokens, outputTokens, ...(parsed.model ? { model: parsed.model } : {}) } } : {}),
    ...(parsed.created_at ? { startedAt: parsed.created_at } : {}),
    ...(parsed.ended_at ? { endedAt: parsed.ended_at } : {}),
    ...(parsed.stop_reason?.type ? { stopReason: parsed.stop_reason.type } : {}),
  };
}

export function createAnthropicManagedProvider(config: ManagedProviderConfig): ManagedAgentProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const agentId = config.agentId?.trim();
  const environmentId = config.environmentId?.trim();
  const maxListBudgetUsd = config.maxListBudgetUsd;
  const vaultIds = config.vaultIds?.filter(Boolean);
  const overrideTools = config.overrideTools === true;

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-beta': BETA_HEADER,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ManagedAgentError(
        `anthropic managed agents ${path} failed: ${response.status} ${body}`.trim(),
        response.status,
      );
    }
    return response.json();
  }

  async function download(fileId: string): Promise<string> {
    const response = await fetchImpl(`${baseUrl}/v1/files/${encodeURIComponent(fileId)}/content`, {
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-beta': BETA_HEADER,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new ManagedAgentError(`anthropic file ${fileId} download failed: ${response.status}`, response.status);
    }
    return response.text();
  }

  return {
    vendor: ANTHROPIC_VENDOR,
    model: config.model,

    async startSession(request: ManagedSessionRequest): Promise<ManagedSession> {
      if (!agentId || !environmentId) {
        throw new ManagedAgentError('anthropic managed agents requires agentId and environmentId');
      }
      if (request.workspaceFiles?.length) {
        throw new ManagedAgentError(
          'anthropic managed agents uses the configured environment, not inline workspace files',
        );
      }
      if (request.effort) {
        throw new ManagedAgentError('anthropic managed agents configures effort on the Agent resource');
      }
      if (request.tools?.allowedHosts?.length || request.tools?.credentialNames?.length) {
        throw new ManagedAgentError('anthropic managed agents does not map host or credential names from this seam');
      }
      // Replacing a configured agent's toolset leaves it nothing to call.
      const mcpServers = overrideTools
        ? request.tools?.mcpEndpoints?.map((endpoint, index) => ({
            type: 'url',
            name: endpoint.name ?? `managed-mcp-${index}`,
            url: endpoint.url,
          }))
        : undefined;
      const body = {
        agent: {
          type: 'agent_with_overrides',
          id: agentId,
          model: { id: request.model },
          ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
          ...(mcpServers?.length
            ? {
                mcp_servers: mcpServers,
                tools: [
                  { type: 'agent_toolset_20260401' },
                  ...mcpServers.map((server) => ({ type: 'mcp_toolset', mcp_server_name: server.name })),
                ],
              }
            : {}),
        },
        environment_id: environmentId,
        ...(vaultIds?.length ? { vault_ids: vaultIds } : {}),
        metadata: { correlation_id: request.correlationId },
        initial_events: [
          {
            type: 'user.message',
            content: [{ type: 'text', text: request.prompt }],
          },
        ],
        ...(maxListBudgetUsd === undefined
          ? {}
          : {
              budget: {
                type: 'limit',
                max_list_cost: { amount: String(maxListBudgetUsd), currency: 'USD' },
              },
            }),
      };
      const parsed = SessionSchema.safeParse(
        await call('/v1/sessions', { method: 'POST', body: JSON.stringify(body) }),
      );
      if (!parsed.success) throw new ManagedAgentError('anthropic managed agents returned an unreadable session');
      return toSession(parsed.data);
    },

    async getSession(sessionId: string): Promise<ManagedSession | null> {
      const raw = await call(`/v1/sessions/${encodeURIComponent(sessionId)}`);
      if (raw === null) return null;
      const parsed = SessionSchema.safeParse(raw);
      if (!parsed.success) throw new ManagedAgentError('anthropic managed agents returned an unreadable session');
      return toSession(parsed.data);
    },

    async listOutputs(sessionId: string): Promise<ManagedOutputRef[]> {
      const raw = await call(`/v1/files?scope_id=${encodeURIComponent(sessionId)}`);
      if (raw === null) return [];
      const parsed = FileListSchema.safeParse(raw);
      if (!parsed.success) throw new ManagedAgentError('anthropic files API returned an unreadable listing');
      return parsed.data.data
        .filter((file) => Boolean(file.filename))
        .map((file) => ({
          path: file.filename!,
          handle: file.id,
          ...(file.size_bytes === undefined ? {} : { sizeBytes: file.size_bytes }),
        }));
    },

    // Files are addressed by id, so the session is not needed here.
    async readOutput(_sessionId: string, ref: ManagedOutputRef): Promise<string> {
      if (!ref.handle) throw new ManagedAgentError(`anthropic output ${ref.path} has no file id`);
      return download(ref.handle);
    },

    async sendMessage(sessionId: string, message: string): Promise<void> {
      await call(`/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          events: [{ type: 'user.message', content: [{ type: 'text', text: message }] }],
        }),
      });
    },

    async cancelSession(sessionId: string): Promise<{ enforced: boolean }> {
      await call(`/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
        method: 'POST',
        body: JSON.stringify({ events: [{ type: 'user.interrupt' }] }),
      });
      return { enforced: true };
    },

    async deleteSession(sessionId: string): Promise<void> {
      await call(`/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => undefined);
    },
  };
}

registerManagedProvider(ANTHROPIC_VENDOR, createAnthropicManagedProvider);
