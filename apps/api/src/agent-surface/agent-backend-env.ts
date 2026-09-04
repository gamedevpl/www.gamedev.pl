// Builds the coding-agent backend registry from the environment.
// Kept apart from app.ts so that "which backend, configured how" is one readable
// decision rather than a branch buried in server wiring — and so a second backend can be
// added here without touching the server at all.

import { MANAGED_AGENT_VENDORS, type ManagedAgentVendorName } from '@gamedevpl/contract';
import type { AgentBackend } from './agent-backend.js';
import type { BuilderKind } from '../creation/builder.js';
import { createManagedProvider, type ManagedAgentEffort } from './managed-agent.js';
import './managed-provider-anthropic.js';
import './managed-provider-copilot.js';
import './managed-provider-openai.js';
import { GEMINI_DEFAULT_MODEL } from './managed-provider-gemini.js';
import { createManagedBackend, type ManagedRoundSignals } from './managed-backend.js';
import type { CopilotGitHubClientFactory } from './managed-provider-copilot.js';
import type { KitDigestLoader } from './kit-digest.js';
import { createSelfBuildBackend, type SelfBuildBackendOptions } from './self-build-backend.js';

interface Logger {
  info: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
  error?: (context: object, message: string) => void; // Missing seeding is broken, not unusual.
}

export { MANAGED_AGENT_VENDORS, type ManagedAgentVendorName };

// One backend per vendor built at boot — a runtime override selects one.
export interface AgentBackendRegistry {
  platformByVendor: Map<string, AgentBackend>;
  defaultVendor?: string;
  self: AgentBackend;
}

// An unconfigured or omitted vendor name falls back to registry.defaultVendor.
export function resolveBuilderBackend(
  registry: AgentBackendRegistry,
  builder: BuilderKind,
  vendor?: string,
): AgentBackend | undefined {
  if (builder === 'self') return registry.self;
  const named = vendor ? registry.platformByVendor.get(vendor) : undefined;
  if (named) return named;
  return registry.defaultVendor ? registry.platformByVendor.get(registry.defaultVendor) : undefined;
}

// What the managed backend needs that the environment cannot supply.
//
// A missing platform backend (undefined) is a supported state, not a failure: local
// development has no dispatch credential, and submissions asking for it wait in `queued`.
export interface ManagedBackendDeps {
  systemPrompt?: () => Promise<string | undefined>;
  kitDigest?: KitDigestLoader;
  // Channel-side round state; without it a finished round looks stalled.
  readSignals?: (jobId: number) => Promise<ManagedRoundSignals | null>;
  readCredentialRef?: (jobId: number, sessionRef: string) => Promise<string | undefined>;
  // N1: catalog's GitHub client, built at the composition root for copilot.
  githubClientFactory?: CopilotGitHubClientFactory;
}

// One vendor's backend — a bad Gemini key must not affect Anthropic.
function buildManagedBackendForVendor(
  vendor: string,
  deps: ManagedBackendDeps | undefined,
  log: Logger | undefined,
  allowGenericApiKeyFallback = false,
): AgentBackend | undefined {
  const isCopilot = vendor === 'copilot';
  const isGemini = vendor === 'gemini';
  const isOpenAi = vendor === 'openai';
  const apiKey = (
    isCopilot
      ? process.env.AGENT_TASKS_TOKEN
      : isGemini
        ? (process.env.GEMINI_API_KEY ?? (allowGenericApiKeyFallback ? process.env.MANAGED_AGENT_API_KEY : undefined))
        : isOpenAi
          ? (process.env.OPENAI_API_KEY ?? (allowGenericApiKeyFallback ? process.env.MANAGED_AGENT_API_KEY : undefined))
          : process.env.MANAGED_AGENT_API_KEY
  )?.trim();
  const model = (
    isCopilot
      ? process.env.AGENT_TASKS_MODEL?.trim() || 'claude-sonnet-4.6'
      : isGemini
        ? process.env.MANAGED_AGENT_GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL
        : isOpenAi
          ? process.env.MANAGED_AGENT_OPENAI_MODEL?.trim()
          : process.env.MANAGED_AGENT_MODEL?.trim()
  )?.trim();
  if (!apiKey || !model) {
    log?.warn(
      { vendor },
      isCopilot
        ? 'copilot managed agent requires AGENT_TASKS_TOKEN'
        : 'managed agent vendor requires MANAGED_AGENT_API_KEY / MANAGED_AGENT_MODEL',
    );
    return undefined;
  }
  const agentId = process.env.MANAGED_AGENT_ID?.trim();
  const environmentId = process.env.MANAGED_AGENT_ENVIRONMENT_ID?.trim();
  const maxDurationSeconds = Number(process.env.MANAGED_AGENT_MAX_SECONDS ?? '');
  const maxListCostCents = Number(process.env.MANAGED_AGENT_MAX_LIST_COST_CENTS ?? '');
  const maxCopilotCredits = Number(process.env.MANAGED_AGENT_COPILOT_MAX_CREDITS ?? '');
  const maxTotalTokens = Number(process.env.MANAGED_AGENT_MAX_TOTAL_TOKENS ?? '');
  const vaultIds = (process.env.MANAGED_AGENT_VAULT_IDS ?? process.env.MANAGED_AGENT_VAULT_ID)
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (vendor === 'anthropic' && (!agentId || !environmentId)) {
    log?.warn({ vendor }, 'anthropic managed agent requires MANAGED_AGENT_ID / MANAGED_AGENT_ENVIRONMENT_ID');
    return undefined;
  }
  // Every vendor, not just the one that bills us directly: a wall clock is the only
  // ceiling that applies whatever the round does, and a managed agent left without one
  // can run for hours on somebody else's meter. Fail closed — no ceiling, no dispatch.
  if (!Number.isInteger(maxDurationSeconds) || maxDurationSeconds <= 0) {
    log?.warn({ vendor }, 'managed agent requires a positive MANAGED_AGENT_MAX_SECONDS');
    return undefined;
  }
  if (vendor === 'anthropic' && (!Number.isInteger(maxListCostCents) || maxListCostCents <= 0)) {
    log?.warn({ vendor }, 'anthropic managed agent requires a positive MANAGED_AGENT_MAX_LIST_COST_CENTS');
    return undefined;
  }
  if (isCopilot && process.env.MANAGED_AGENT_COPILOT_MAX_CREDITS !== undefined) {
    if (!Number.isFinite(maxCopilotCredits) || maxCopilotCredits <= 0) {
      log?.warn({ vendor }, 'copilot managed agent credit ceiling must be positive');
      return undefined;
    }
  }
  if ((isGemini || isOpenAi) && process.env.MANAGED_AGENT_MAX_TOTAL_TOKENS !== undefined) {
    if (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens <= 0) {
      log?.warn({ vendor }, 'managed agent token ceiling must be a positive safe integer');
      return undefined;
    }
  }
  // Every managed vendor dispatches over MCP; there is no other lane.
  const mcpUrl = process.env.MANAGED_AGENT_MCP_URL?.trim();
  if (!mcpUrl) {
    log?.warn({ vendor }, 'managed agent requires MANAGED_AGENT_MCP_URL');
    return undefined;
  }
  // Without the scratch repo an MCP round has nowhere to dispatch.
  if (isCopilot && !process.env.MANAGED_AGENT_COPILOT_MCP_REPO?.trim()) {
    log?.warn({ vendor }, 'copilot managed agent requires MANAGED_AGENT_COPILOT_MCP_REPO');
    return undefined;
  }

  const effort = process.env.MANAGED_AGENT_EFFORT?.trim() as ManagedAgentEffort | undefined;
  const deliveryMode = process.env.MANAGED_AGENT_DELIVERY_MODE?.trim() === 'publish' ? 'publish' : 'preview';

  let provider;
  try {
    provider = createManagedProvider(vendor, {
      apiKey,
      model,
      // Anthropic's own resource ids — never another vendor's.
      ...(vendor === 'anthropic' && process.env.MANAGED_AGENT_ID?.trim()
        ? { agentId: process.env.MANAGED_AGENT_ID.trim() }
        : {}),
      ...(vendor === 'anthropic' && process.env.MANAGED_AGENT_ENVIRONMENT_ID?.trim()
        ? { environmentId: process.env.MANAGED_AGENT_ENVIRONMENT_ID.trim() }
        : {}),
      ...(Number.isInteger(maxListCostCents) && maxListCostCents > 0 ? { maxListCostCents } : {}),
      ...((isGemini || isOpenAi) && Number.isSafeInteger(maxTotalTokens) && maxTotalTokens > 0
        ? { budget: { unit: 'tokens' as const, max: maxTotalTokens } }
        : {}),
      ...(vaultIds?.length ? { vaultIds } : {}),
      ...(isCopilot
        ? {
            mcpRepo: process.env.MANAGED_AGENT_COPILOT_MCP_REPO!.trim(),
            ...(process.env.MANAGED_AGENT_COPILOT_MCP_BASE_REF?.trim()
              ? { mcpBaseRef: process.env.MANAGED_AGENT_COPILOT_MCP_BASE_REF.trim() }
              : {}),
            ...(process.env.MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT?.trim()
              ? { mcpCustomAgent: process.env.MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT.trim() }
              : {}),
          }
        : {}),
      ...(!isCopilot ? { overrideTools: true } : {}),
      ...(isCopilot && deps?.githubClientFactory ? { githubClientFactory: deps.githubClientFactory } : {}),
      ...(process.env.MANAGED_AGENT_BASE_URL?.trim() ? { baseUrl: process.env.MANAGED_AGENT_BASE_URL.trim() } : {}),
    });
  } catch (error) {
    log?.warn({ err: error, vendor }, 'could not build the managed agent provider; platform dispatch stays off');
    return undefined;
  }

  log?.info({ vendor, model, deliveryMode, backend: `managed:${vendor}` }, 'managed agent dispatch enabled');

  return createManagedBackend({
    provider,
    ...(deps?.readSignals ? { readSignals: deps.readSignals } : {}),
    ...(deps?.readCredentialRef ? { readCredentialRef: deps.readCredentialRef } : {}),
    tools: { mcpEndpoints: [{ url: mcpUrl, name: 'gamedevpl' }] },
    ...(!isCopilot
      ? {
          mcpBearerCredential: (brief) =>
            brief.mcpOpenerToken ? { url: mcpUrl, token: brief.mcpOpenerToken } : undefined,
        }
      : {}),
    ...(deps?.systemPrompt ? { systemPrompt: deps.systemPrompt } : {}),
    ...(deps?.kitDigest ? { kitDigest: deps.kitDigest } : {}),
    ...(effort ? { effort } : {}),
    ...(Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0 ? { maxDurationSeconds } : {}),
    ...(isCopilot && Number.isFinite(maxCopilotCredits) && maxCopilotCredits > 0
      ? { budget: { unit: 'credits' as const, max: maxCopilotCredits } }
      : {}),
    ...((isGemini || isOpenAi) && Number.isSafeInteger(maxTotalTokens) && maxTotalTokens > 0
      ? { budget: { unit: 'tokens' as const, max: maxTotalTokens } }
      : {}),
    ...(log ? { log } : {}),
  });
}

// @deprecated Single-vendor convenience; prefer createManagedPlatformBackendsFromEnv.
export function createManagedPlatformBackendFromEnv(deps?: ManagedBackendDeps, log?: Logger): AgentBackend | undefined {
  const vendor = process.env.MANAGED_AGENT_VENDOR?.trim();
  if (!vendor) return undefined;
  return buildManagedBackendForVendor(vendor, deps, log, vendor === 'gemini');
}

// One backend per configured vendor; a runtime override selects between them.
export function createManagedPlatformBackendsFromEnv(
  deps?: ManagedBackendDeps,
  log?: Logger,
): { platformByVendor: Map<string, AgentBackend>; defaultVendor?: string } {
  const defaultVendor = process.env.MANAGED_AGENT_VENDOR?.trim() || undefined;
  const platformByVendor = new Map<string, AgentBackend>();
  for (const vendor of MANAGED_AGENT_VENDORS) {
    // Only the default vendor's own build warnings are logged.
    const backend = buildManagedBackendForVendor(
      vendor,
      deps,
      vendor === defaultVendor ? log : undefined,
      vendor === defaultVendor,
    );
    if (backend) platformByVendor.set(vendor, backend);
  }
  return { platformByVendor, ...(defaultVendor ? { defaultVendor } : {}) };
}

// MP-04: an invalid default means no builder, never a silent Copilot fallback.
export function createAgentBackendRegistryFromEnv(
  log?: Logger,
  selfOptions?: SelfBuildBackendOptions,
  managedDeps?: ManagedBackendDeps,
): AgentBackendRegistry {
  const { platformByVendor, defaultVendor } = createManagedPlatformBackendsFromEnv(managedDeps, log);
  const self = createSelfBuildBackend(selfOptions);
  if (defaultVendor && !platformByVendor.has(defaultVendor)) {
    log?.warn({ vendor: defaultVendor }, 'managed agent vendor is set but invalid; platform dispatch stays off');
  } else if (platformByVendor.size === 0) {
    log?.info({ backend: 'self' }, 'self-build backend enabled (no platform dispatch credential)');
  }
  return { platformByVendor, ...(defaultVendor ? { defaultVendor } : {}), self };
}
