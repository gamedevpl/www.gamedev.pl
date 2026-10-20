// Builds the coding-agent backend registry from the environment.
// Kept apart from app.ts so that "which backend, configured how" is one readable
// decision rather than a branch buried in server wiring — and so a second backend can be
// added here without touching the server at all.

import { MANAGED_AGENT_VENDORS, type ManagedAgentVendorName } from '@gamedevpl/contract';
import type { AgentBackend } from './agent-backend.js';
import type { BuilderKind } from '../creation/builder.js';
import { createManagedProvider, type ManagedAgentEffort } from './managed-agent.js';
import './managed-provider-anthropic.js';
import './managed-provider-openai.js';
import { GEMINI_DEFAULT_MODEL } from './managed-provider-gemini.js';
import { createManagedBackend, type ManagedRoundSignals } from './managed-backend.js';
import type { KitDigestLoader } from './kit-digest.js';
import type { ManagedWorkspaceLoader } from './managed-workspace.js';
import { builderSystemPrompt } from './builder-system-prompt.js';
import { createSelfBuildBackend, type SelfBuildBackendOptions } from './self-build-backend.js';
import type { CreatorMemoryIndex } from './managed-creator-memory.js';

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
  // Kit + sources mounted for vendors that can take files (workspaceArchiveDir).
  workspace?: ManagedWorkspaceLoader;
  // Channel-side round state; without it a finished round looks stalled.
  readSignals?: (jobId: number) => Promise<ManagedRoundSignals | null>;
  readCredentialRef?: (jobId: number, sessionRef: string) => Promise<string | undefined>;
  // Used only when MANAGED_AGENT_GAME_MEMORY=true.
  creatorMemory?: CreatorMemoryIndex;
}

const EFFORTS: readonly ManagedAgentEffort[] = ['low', 'medium', 'high'];

// Gemini rejects any effort, so Anthropic's never rides the shared variable.
export function managedEffortFor(vendor: string, log?: Logger): ManagedAgentEffort | undefined {
  if (vendor !== 'anthropic') return process.env.MANAGED_AGENT_EFFORT?.trim() as ManagedAgentEffort | undefined;
  const value = process.env.MANAGED_AGENT_ANTHROPIC_EFFORT?.trim();
  if (!value || (EFFORTS as readonly string[]).includes(value)) return value as ManagedAgentEffort | undefined;
  // A typo falls back to the model default, never a guessed effort.
  log?.warn({ effort: value }, 'MANAGED_AGENT_ANTHROPIC_EFFORT is not low, medium or high; using the model default');
  return undefined;
}

// One vendor's backend — a bad Gemini key must not affect Anthropic.
function buildManagedBackendForVendor(
  vendor: string,
  deps: ManagedBackendDeps | undefined,
  log: Logger | undefined,
  allowGenericApiKeyFallback = false,
): AgentBackend | undefined {
  const isGemini = vendor === 'gemini';
  const isOpenAi = vendor === 'openai';
  const apiKey = (
    isGemini
      ? (process.env.GEMINI_API_KEY ?? (allowGenericApiKeyFallback ? process.env.MANAGED_AGENT_API_KEY : undefined))
      : isOpenAi
        ? (process.env.OPENAI_API_KEY ?? (allowGenericApiKeyFallback ? process.env.MANAGED_AGENT_API_KEY : undefined))
        : process.env.MANAGED_AGENT_API_KEY
  )?.trim();
  const model = (
    isGemini
      ? process.env.MANAGED_AGENT_GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL
      : isOpenAi
        ? process.env.MANAGED_AGENT_OPENAI_MODEL?.trim()
        : process.env.MANAGED_AGENT_MODEL?.trim()
  )?.trim();
  if (!apiKey || !model) {
    log?.warn({ vendor }, 'managed agent vendor requires MANAGED_AGENT_API_KEY / MANAGED_AGENT_MODEL');
    return undefined;
  }
  const agentId = process.env.MANAGED_AGENT_ID?.trim();
  const environmentId = process.env.MANAGED_AGENT_ENVIRONMENT_ID?.trim();
  const maxDurationSeconds = Number(process.env.MANAGED_AGENT_MAX_SECONDS ?? '');
  const maxListCostCents = Number(process.env.MANAGED_AGENT_MAX_LIST_COST_CENTS ?? '');
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
  // Every managed vendor dispatches over MCP; there is no other lane.
  const mcpUrl = process.env.MANAGED_AGENT_MCP_URL?.trim();
  if (!mcpUrl) {
    log?.warn({ vendor }, 'managed agent requires MANAGED_AGENT_MCP_URL');
    return undefined;
  }
  // Wall clock bounds how long a round runs, never what it spends.
  if ((isGemini || isOpenAi) && (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens <= 0)) {
    log?.warn({ vendor }, 'managed agent requires a positive token ceiling: MANAGED_AGENT_MAX_TOTAL_TOKENS');
    return undefined;
  }

  const effort = managedEffortFor(vendor, log);
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
      overrideTools: true,
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
    mcpBearerCredential: (brief) => (brief.mcpOpenerToken ? { url: mcpUrl, token: brief.mcpOpenerToken } : undefined),
    systemPrompt: deps?.systemPrompt ?? (async () => builderSystemPrompt({ shell: provider.shell === true })),
    ...(deps?.kitDigest ? { kitDigest: deps.kitDigest } : {}),
    ...(deps?.workspace ? { workspace: deps.workspace } : {}),
    ...(deps?.creatorMemory && process.env.MANAGED_AGENT_GAME_MEMORY?.trim() === 'true'
      ? { creatorMemory: deps.creatorMemory }
      : {}),
    ...(effort ? { effort } : {}),
    ...(Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0 ? { maxDurationSeconds } : {}),
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
