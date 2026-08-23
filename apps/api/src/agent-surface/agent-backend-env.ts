// Builds the coding-agent backend registry from the environment.
// Kept apart from app.ts so that "which backend, configured how" is one readable
// decision rather than a branch buried in server wiring — and so a second backend can be
// added here without touching the server at all.

import { MANAGED_AGENT_VENDORS, type ManagedAgentVendorName } from '@gamedevpl/contract';
import type { AgentBackend } from './agent-backend.js';
import type { BuilderKind } from '../creation/builder.js';
import { ModelGameSeeder, DEFAULT_SEED_PROVIDER, type GameSeeder } from '../creation/game-seed.js';
import { createManagedProvider, type ManagedAgentEffort } from './managed-agent.js';
import './managed-provider-anthropic.js';
import './managed-provider-copilot.js';
import './managed-provider-openai.js';
import { GEMINI_DEFAULT_MODEL } from './managed-provider-gemini.js';
import { createManagedBackend, type ManagedRoundSignals } from './managed-backend.js';
import type { KitDigestLoader } from './kit-digest.js';
import type { QueryKnowledgeFn } from '../creation/knowledge-search.js';
import { createArchiveSeedContextSource } from '../creation/seed-context.js';
import type { GameSnapshotReader } from '../catalog/game-snapshot.js';
import { createSelfBuildBackend, type SelfBuildBackendOptions } from './self-build-backend.js';
import type { SeedProviderConfig } from '../creation/seed-provider.js';
import '../creation/seed-provider-vertex.js';
import '../creation/seed-provider-anthropic.js';
import '../creation/seed-provider-openai.js';
import '../creation/seed-provider-meta.js';
import '../creation/seed-provider-openrouter.js';
import { DEFAULT_VERTEX_SEED_MODEL } from '../creation/seed-provider-vertex.js';

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
  readSignals?: (issueNumber: number) => Promise<ManagedRoundSignals | null>;
  readCredentialRef?: (issueNumber: number, sessionRef: string) => Promise<string | undefined>;
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

// Every seed vendor this file can build a config for; registration is unconditional.
export const SEED_PROVIDER_IDS = ['vertex', 'anthropic', 'openai', 'meta', 'openrouter'] as const;
export type SeedProviderId = (typeof SEED_PROVIDER_IDS)[number];

// Muse Spark always reasons and cannot turn it off (ops: seed-provider-selection-plan.md
// SP-16) — measured burning the pick call's whole 2048-token default on reasoning alone.
// Every other vendor here can opt out of it, so this default is Meta-only.
const PICK_MAX_OUTPUT_TOKENS_DEFAULTS: Partial<Record<SeedProviderId, number>> = { meta: 8192 };

// Undefined when the credential/model are unset. Vertex needs neither: ambient ADC.
function seedMaxOutputTokens(envVar: string, log: Logger | undefined, id: SeedProviderId): number | undefined {
  const raw = process.env[envVar]?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    log?.warn({ provider: id, envVar, raw }, `${envVar} is not a positive integer; ignoring`);
    return undefined;
  }
  return parsed;
}

function buildSeedProviderConfig(id: SeedProviderId, log: Logger | undefined): SeedProviderConfig | undefined {
  if (id === 'vertex') {
    const projectId = process.env.VERTEX_PROJECT_ID?.trim();
    const region = process.env.VERTEX_REGION?.trim();
    const maxOutputTokens = seedMaxOutputTokens('SEED_MAX_OUTPUT_TOKENS', log, id);
    const pickMaxOutputTokens = seedMaxOutputTokens('SEED_PICK_MAX_OUTPUT_TOKENS', log, id);
    return {
      model: process.env.SEED_MODEL?.trim() || DEFAULT_VERTEX_SEED_MODEL,
      ...(projectId ? { projectId } : {}),
      ...(region ? { region } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(pickMaxOutputTokens ? { pickMaxOutputTokens } : {}),
    };
  }
  const envPrefix = id.toUpperCase();
  const apiKey = process.env[`SEED_${envPrefix}_API_KEY`]?.trim();
  const model = process.env[`SEED_${envPrefix}_MODEL`]?.trim();
  if (!apiKey || !model) {
    log?.warn(
      { provider: id },
      `seed provider "${id}" requires SEED_${envPrefix}_API_KEY and SEED_${envPrefix}_MODEL; staying unconfigured`,
    );
    return undefined;
  }
  const baseUrl = process.env[`SEED_${envPrefix}_BASE_URL`]?.trim();
  // Streaming (game-seed.ts) skips the guard that forced anthropic's default down.
  const maxOutputTokens = seedMaxOutputTokens(`SEED_${envPrefix}_MAX_OUTPUT_TOKENS`, log, id);
  const pickMaxOutputTokens =
    seedMaxOutputTokens(`SEED_${envPrefix}_PICK_MAX_OUTPUT_TOKENS`, log, id) ?? PICK_MAX_OUTPUT_TOKENS_DEFAULTS[id];
  return {
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    ...(pickMaxOutputTokens ? { pickMaxOutputTokens } : {}),
  };
}

export interface SeedProviderEnvRegistry {
  providers: Map<string, SeedProviderConfig>;
  // Runtime override; unset (or invalid) defers to this rather than to nothing.
  defaultProvider: string;
}

// Vertex is unconditional, so this map is never empty; the console holds the real switch.
export function createSeedProvidersFromEnv(log?: Logger): SeedProviderEnvRegistry {
  const providers = new Map<string, SeedProviderConfig>();
  for (const id of SEED_PROVIDER_IDS) {
    const config = buildSeedProviderConfig(id, id === 'vertex' ? undefined : log);
    if (config) providers.set(id, config);
  }
  const requested = process.env.SEED_PROVIDER?.trim();
  const defaultProvider = requested && providers.has(requested) ? requested : DEFAULT_SEED_PROVIDER;
  if (requested && !providers.has(requested)) {
    log?.warn({ requested, fallback: defaultProvider }, 'SEED_PROVIDER names an unconfigured vendor; falling back');
  }
  return { providers, defaultProvider };
}

// Undefined when this environment has no games-repo token. Which vendor answers is separate.
// Reads with GAMES_REPO_TOKEN, not the dispatch PAT — narrower blast radius.
export function createGameSeederFromEnv(
  log?: Logger,
  knowledgeSearch?: QueryKnowledgeFn,
  snapshotReader?: GameSnapshotReader | null,
): GameSeeder | undefined {
  // Tests inject their own seeder; ambient GITHUB_TOKEN must not buy a real one.
  if (process.env.NODE_ENV === 'test') return undefined;

  const token = process.env.GAMES_REPO_TOKEN?.trim() ?? process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim() ?? 'gamedevpl/www.gamedev.pl-games';
  const ref = process.env.GAMES_PUBLISHED_REF?.trim() || 'main';
  if (!token) {
    (log?.error ?? log?.warn)?.call(
      log,
      { repo },
      'no games-repo token: new games will start from an empty directory instead of a generated round 0',
    );
    return undefined;
  }

  const { providers, defaultProvider } = createSeedProvidersFromEnv(log);
  log?.info({ repo, ref, defaultProvider, configuredProviders: [...providers.keys()] }, 'round-0 seeding ready');

  return new ModelGameSeeder({
    context: createArchiveSeedContextSource({
      repo,
      ref,
      token,
      ...(log ? { log } : {}),
      // Archive dropped catalog.json; snapshot is the source now.
      ...(snapshotReader ? { getCatalog: () => snapshotReader.getCatalog() } : {}),
    }),
    providers,
    defaultProvider,
    ...(log ? { log } : {}),
    ...(knowledgeSearch ? { knowledgeSearch } : {}),
  });
}
