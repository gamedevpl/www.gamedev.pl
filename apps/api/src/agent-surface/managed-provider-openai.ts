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

export const OPENAI_VENDOR = 'openai';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

// OpenAI sends explicit null here, not omission — must be nullable.
const UsageSchema = z
  .object({
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
    input_tokens_details: z
      .object({ cached_tokens: z.number().nonnegative().optional() })
      .partial()
      .nullable()
      .optional(),
    output_tokens_details: z
      .object({ reasoning_tokens: z.number().nonnegative().optional() })
      .partial()
      .nullable()
      .optional(),
  })
  .partial();

const ResponseSchema = z
  .object({
    id: z.string().min(1),
    status: z.string().optional(),
    model: z.string().optional(),
    created_at: z.number().optional(),
    incomplete_details: z.object({ reason: z.string().nullable().optional() }).partial().nullable().optional(),
    usage: UsageSchema.nullable().optional(),
  })
  .passthrough();

type OpenAiMcpTool = {
  type: 'mcp';
  server_label: string;
  server_url: string;
  // Never omitted — default requires approval per call; nothing can grant it.
  require_approval: 'never';
  // `headers` is real but is dropped on tool calls — verified live.
  authorization?: string;
};

function mcpTools(request: ManagedSessionRequest): OpenAiMcpTool[] {
  const credential = request.mcpBearerCredential;
  return (request.tools?.mcpEndpoints ?? []).map((endpoint, index) => {
    const label = endpoint.name ?? `managed_mcp_${index}`;
    const token = credential?.url === endpoint.url ? credential.token : undefined;
    return {
      type: 'mcp',
      server_label: label,
      server_url: endpoint.url,
      require_approval: 'never',
      ...(token ? { authorization: token } : {}),
    };
  });
}

// Only a token ceiling counts as budget-stopped; content filters do not.
function isBudgetIncomplete(reason: string | null | undefined): boolean {
  return reason === 'max_output_tokens' || reason === 'max_tokens';
}

function toSession(parsed: z.infer<typeof ResponseSchema>, configuredModel: string): ManagedSession {
  const usage = parsed.usage;
  const budgetStopped = parsed.status === 'incomplete' && isBudgetIncomplete(parsed.incomplete_details?.reason);
  return {
    id: parsed.id,
    state: normalizeManagedState(parsed.status),
    ...(parsed.status ? { vendorState: parsed.status } : {}),
    ...(usage
      ? {
          usage: {
            unit: 'tokens' as const,
            vendor: 'openai' as const,
            model: parsed.model ?? configuredModel,
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
            cachedTokens: usage.input_tokens_details?.cached_tokens ?? 0,
          },
        }
      : {}),
    ...(parsed.created_at !== undefined ? { startedAt: new Date(parsed.created_at * 1000).toISOString() } : {}),
    ...(budgetStopped ? { stopReason: 'budget_reached' } : {}),
  };
}

export function createOpenAiManagedProvider(config: ManagedProviderConfig): ManagedAgentProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = config.model;

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ManagedAgentError(
        `openai responses ${path} failed: ${response.status} ${body}`.trim(),
        response.status,
      );
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    vendor: OPENAI_VENDOR,
    model,
    // No checkout or environment — nowhere for a seed to land.
    supportsSeedFiles: false,

    async startSession(request: ManagedSessionRequest): Promise<ManagedSession> {
      if (request.workspaceFiles?.length) {
        throw new ManagedAgentError('openai managed agents has no workspace to seed — the round has no checkout');
      }
      const tools = mcpTools(request);
      const body = {
        model: request.model || model,
        input: request.prompt,
        background: true,
        store: true,
        ...(request.systemPrompt ? { instructions: request.systemPrompt } : {}),
        ...(tools.length ? { tools } : {}),
        ...(request.effort ? { reasoning: { effort: request.effort } } : {}),
        // Partial belt only: caps one response, not the round's total.
        ...(config.budget?.unit === 'tokens' ? { max_output_tokens: config.budget.max } : {}),
      };
      const raw = await call('/responses', { method: 'POST', body: JSON.stringify(body) });
      const parsed = ResponseSchema.safeParse(raw);
      if (!parsed.success) {
        // Temporary: the generic message hides which shape actually broke it.
        console.warn('openai startSession unreadable response, raw response:', JSON.stringify(raw));
        throw new ManagedAgentError('openai managed agents returned an unreadable response');
      }
      return toSession(parsed.data, model);
    },

    async getSession(sessionId: string): Promise<ManagedSession | null> {
      const raw = await call(`/responses/${encodeURIComponent(sessionId)}`);
      if (raw === null) return null;
      const parsed = ResponseSchema.safeParse(raw);
      if (!parsed.success) throw new ManagedAgentError('openai managed agents returned an unreadable response');
      return toSession(parsed.data, model);
    },

    async cancelSession(sessionId: string): Promise<{ enforced: boolean }> {
      // OpenAI 400s cancelling an already-finished session; same as a 404.
      try {
        const response = await call(`/responses/${encodeURIComponent(sessionId)}/cancel`, { method: 'POST' });
        return { enforced: response !== null };
      } catch {
        return { enforced: false };
      }
    },

    async deleteSession(sessionId: string): Promise<void> {
      await call(`/responses/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => undefined);
    },
  };
}

registerManagedProvider(OPENAI_VENDOR, createOpenAiManagedProvider);
