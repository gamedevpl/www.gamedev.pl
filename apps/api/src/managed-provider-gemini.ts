import { z } from 'zod';
import {
  ManagedAgentError,
  normalizeManagedState,
  registerManagedProvider,
  type ManagedAgentProvider,
  type ManagedProviderConfig,
  type ManagedSession,
  type ManagedSessionRequest,
} from './managed-agent.js';

export const GEMINI_VENDOR = 'gemini';
export const GEMINI_DEFAULT_AGENT = 'antigravity-preview-05-2026';
export const GEMINI_DEFAULT_MODEL = 'gemini-3.7-flash';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 30_000;
const API_REVISION = '2026-05-20';

const UsageSchema = z
  .object({
    total_input_tokens: z.number().nonnegative().optional(),
    total_output_tokens: z.number().nonnegative().optional(),
    total_thought_tokens: z.number().nonnegative().optional(),
    total_cached_tokens: z.number().nonnegative().optional(),
    total_tool_use_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
  })
  .partial();

const InteractionSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().optional(),
    model: z.string().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
    usage: UsageSchema.optional(),
    environment_id: z.string().optional(),
  })
  .passthrough();

type GeminiMcpTool = {
  type: 'mcp_server';
  name: string;
  url: string;
  headers?: { Authorization: string };
};

function hostnames(request: ManagedSessionRequest): string[] {
  const hosts = new Set(request.tools?.allowedHosts?.filter(Boolean));
  for (const endpoint of request.tools?.mcpEndpoints ?? []) {
    try {
      hosts.add(new URL(endpoint.url).hostname);
    } catch {
      throw new ManagedAgentError(`gemini MCP endpoint is not a valid URL: ${endpoint.url}`);
    }
  }
  return [...hosts];
}

function mcpTools(request: ManagedSessionRequest): GeminiMcpTool[] {
  const credential = request.mcpBearerCredential;
  return (request.tools?.mcpEndpoints ?? []).map((endpoint, index) => {
    const name = endpoint.name ?? `managed_mcp_${index}`;
    if (!/^[a-z0-9_-]+$/.test(name)) {
      throw new ManagedAgentError(`gemini MCP server name is invalid: ${name}`);
    }
    const token = credential?.url === endpoint.url ? credential.token : undefined;
    return {
      type: 'mcp_server',
      name,
      url: endpoint.url,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    };
  });
}

// Only for an auto-created environment — never a reused named one.
function toSession(
  parsed: z.infer<typeof InteractionSchema>,
  configuredModel: string,
  trackEnvironment: boolean,
): ManagedSession {
  const usage = parsed.usage;
  const budgetStopped = parsed.status === 'incomplete' || parsed.status === 'budget_exceeded';
  return {
    id: parsed.id,
    state: normalizeManagedState(parsed.status),
    ...(trackEnvironment && parsed.environment_id ? { workspace: parsed.environment_id } : {}),
    ...(parsed.status ? { vendorState: parsed.status } : {}),
    ...(usage
      ? {
          usage: {
            unit: 'tokens' as const,
            vendor: 'gemini' as const,
            model: parsed.model ?? configuredModel,
            inputTokens: usage.total_input_tokens ?? 0,
            outputTokens: usage.total_output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            thoughtTokens: usage.total_thought_tokens ?? 0,
            cachedTokens: usage.total_cached_tokens ?? 0,
            toolUseTokens: usage.total_tool_use_tokens ?? 0,
          },
        }
      : {}),
    ...(parsed.created ? { startedAt: parsed.created } : {}),
    ...(parsed.updated ? { endedAt: parsed.updated } : {}),
    ...(budgetStopped ? { stopReason: 'budget_reached' } : {}),
  };
}

export function createGeminiManagedProvider(config: ManagedProviderConfig): ManagedAgentProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = config.model || GEMINI_DEFAULT_MODEL;
  const agent = config.agentId?.trim() || GEMINI_DEFAULT_AGENT;

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'x-goog-api-key': config.apiKey,
        'api-revision': API_REVISION,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) {
      console.warn('gemini call() 404:', path);
      return null;
    }
    if (!response.ok) {
      throw new ManagedAgentError(`gemini interactions ${path} failed: ${response.status}`, response.status);
    }
    const text = await response.text();
    if (!text) console.warn('gemini call() empty 2xx body:', path, response.status);
    return text ? JSON.parse(text) : null;
  }

  return {
    vendor: GEMINI_VENDOR,
    model,
    // A named environment is fixed; a scratch workspace accepts inline sources.
    supportsSeedFiles: !config.environmentId,

    async startSession(request: ManagedSessionRequest): Promise<ManagedSession> {
      if (request.effort) throw new ManagedAgentError('gemini managed agents does not support effort overrides');
      if (config.environmentId && request.workspaceFiles?.length) {
        throw new ManagedAgentError('gemini managed agents cannot add seed files to a named environment');
      }

      const tools = mcpTools(request);
      const hosts = hostnames(request);
      const environment = {
        type: 'remote',
        ...(config.environmentId ? { environment_id: config.environmentId } : {}),
        ...(request.workspaceFiles?.length
          ? {
              sources: request.workspaceFiles.map((file) => ({
                type: 'inline',
                target: `/workspace/${file.path.replace(/^\/+/, '')}`,
                content: file.content,
              })),
            }
          : {}),
        ...(hosts.length ? { network: { allowlist: hosts.map((domain) => ({ domain })) } } : {}),
      };
      const agentConfig = {
        type: 'antigravity',
        ...(!config.agentId ? { model: request.model || model } : {}),
        ...(config.budget?.unit === 'tokens' ? { max_total_tokens: String(config.budget.max) } : {}),
      };
      const body = {
        agent,
        input: request.prompt,
        background: true,
        store: true,
        ...(request.systemPrompt ? { system_instruction: request.systemPrompt } : {}),
        ...(tools.length ? { tools } : {}),
        environment,
        agent_config: agentConfig,
      };
      const raw = await call('/interactions', { method: 'POST', body: JSON.stringify(body) });
      const parsed = InteractionSchema.safeParse(raw);
      if (!parsed.success) {
        // Temporary: the generic message hides which shape actually broke it.
        console.warn('gemini startSession unreadable interaction, raw response:', JSON.stringify(raw));
        throw new ManagedAgentError('gemini managed agents returned an unreadable interaction');
      }
      return toSession(parsed.data, model, !config.environmentId);
    },

    async getSession(sessionId: string): Promise<ManagedSession | null> {
      const raw = await call(`/interactions/${encodeURIComponent(sessionId)}`);
      if (raw === null) return null;
      const parsed = InteractionSchema.safeParse(raw);
      if (!parsed.success) throw new ManagedAgentError('gemini managed agents returned an unreadable interaction');
      return toSession(parsed.data, model, !config.environmentId);
    },

    async cancelSession(sessionId: string): Promise<{ enforced: boolean }> {
      const response = await call(`/interactions/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST' });
      return { enforced: response !== null };
    },

    async deleteSession(sessionId: string): Promise<void> {
      await call(`/interactions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => undefined);
    },

    // Only called with an auto-created environment id — see toSession above.
    async deleteWorkspace(workspace: string): Promise<void> {
      await call(`/environments/${encodeURIComponent(workspace)}`, { method: 'DELETE' }).catch(() => undefined);
    },
  };
}

registerManagedProvider(GEMINI_VENDOR, createGeminiManagedProvider);
