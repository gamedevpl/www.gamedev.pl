// Builds the coding-agent backend registry from the environment.
//
// Kept apart from app.ts so that "which backend, configured how" is one readable
// decision rather than a branch buried in server wiring — and so a second backend can be
// added here without touching the server at all.

import type { AgentBackend } from './agent-backend.js';
import type { BuilderKind } from './builder.js';
import { VertexGameSeeder, type GameSeeder } from './game-seed.js';
import { createManagedProvider, type ManagedAgentEffort, type ManagedPromptLane } from './managed-agent.js';
import './managed-provider-anthropic.js';
import './managed-provider-copilot.js';
import { GEMINI_DEFAULT_MODEL } from './managed-provider-gemini.js';
import {
  createManagedBackend,
  type ManagedDeliveryLock,
  type ManagedDeliverySink,
  type ManagedRoundSignals,
} from './managed-backend.js';
import type { KitDigestLoader } from './kit-digest.js';
import type { QueryKnowledgeFn } from './knowledge-search.js';
import { createArchiveSeedContextSource } from './seed-context.js';
import { createSelfBuildBackend, type SelfBuildBackendOptions } from './self-build-backend.js';

interface Logger {
  info: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
}

/** Registry keyed by the round's builder. `self` is always present; platform needs creds. */
export interface AgentBackendRegistry {
  platform?: AgentBackend;
  self: AgentBackend;
}

export function resolveBuilderBackend(registry: AgentBackendRegistry, builder: BuilderKind): AgentBackend | undefined {
  return builder === 'self' ? registry.self : registry.platform;
}

// What the managed backend needs that the environment cannot supply.
//
// A missing platform backend (undefined) is a supported state, not a failure: local
// development has no dispatch credential, and submissions asking for it wait in `queued`.
export interface ManagedBackendDeps {
  deliver?: ManagedDeliverySink;
  lock?: ManagedDeliveryLock;
  systemPrompt?: () => Promise<string | undefined>;
  kitDigest?: KitDigestLoader;
  // Channel-side round state; without it a finished round looks stalled.
  readSignals?: (issueNumber: number) => Promise<ManagedRoundSignals | null>;
  readCredentialRef?: (issueNumber: number, sessionRef: string) => Promise<string | undefined>;
}

// Vendor is a variable; a delivery sink is required.
export function createManagedPlatformBackendFromEnv(deps?: ManagedBackendDeps, log?: Logger): AgentBackend | undefined {
  const vendor = process.env.MANAGED_AGENT_VENDOR?.trim();
  if (!vendor) return undefined;

  const isCopilot = vendor === 'copilot';
  const isGemini = vendor === 'gemini';
  const apiKey = (
    isCopilot
      ? process.env.AGENT_TASKS_TOKEN
      : isGemini
        ? (process.env.GEMINI_API_KEY ?? process.env.MANAGED_AGENT_API_KEY)
        : process.env.MANAGED_AGENT_API_KEY
  )?.trim();
  const model = (
    isCopilot
      ? process.env.AGENT_TASKS_MODEL?.trim() || 'claude-sonnet-4.6'
      : isGemini
        ? process.env.MANAGED_AGENT_MODEL?.trim() || GEMINI_DEFAULT_MODEL
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
  const configuredPromptLane = process.env.MANAGED_AGENT_PROMPT_LANE?.trim();
  const promptLane = configuredPromptLane as ManagedPromptLane | undefined;
  if (configuredPromptLane && !['mcp', 'harness', 'outputs'].includes(configuredPromptLane)) {
    log?.warn({ vendor }, 'managed agent prompt lane must be mcp, harness, or outputs');
    return undefined;
  }
  if (isGemini && process.env.MANAGED_AGENT_MAX_TOTAL_TOKENS !== undefined) {
    if (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens <= 0) {
      log?.warn({ vendor }, 'gemini managed agent token ceiling must be a positive safe integer');
      return undefined;
    }
  }
  // An MCP agent submits for itself, so it needs no sink.
  const mcpUrl = process.env.MANAGED_AGENT_MCP_URL?.trim();
  // Anthropic and Gemini default to MCP.
  // Validate before backend construction so startup fails closed.
  const effectivePromptLane = promptLane ?? (isCopilot ? 'harness' : 'mcp');
  const needsMcpEndpoint = effectivePromptLane === 'mcp';
  if (needsMcpEndpoint && !mcpUrl) {
    log?.warn({ vendor }, 'managed agent MCP lane is enabled but MANAGED_AGENT_MCP_URL is missing');
    return undefined;
  }

  const effort = process.env.MANAGED_AGENT_EFFORT?.trim() as ManagedAgentEffort | undefined;
  const deliveryMode = process.env.MANAGED_AGENT_DELIVERY_MODE?.trim() === 'publish' ? 'publish' : 'preview';

  let provider;
  try {
    provider = createManagedProvider(vendor, {
      apiKey,
      model,
      ...(process.env.MANAGED_AGENT_ID?.trim() ? { agentId: process.env.MANAGED_AGENT_ID.trim() } : {}),
      ...(process.env.MANAGED_AGENT_ENVIRONMENT_ID?.trim()
        ? { environmentId: process.env.MANAGED_AGENT_ENVIRONMENT_ID.trim() }
        : {}),
      ...(Number.isInteger(maxListCostCents) && maxListCostCents > 0 ? { maxListCostCents } : {}),
      ...(isGemini && Number.isSafeInteger(maxTotalTokens) && maxTotalTokens > 0
        ? { budget: { unit: 'tokens' as const, max: maxTotalTokens } }
        : {}),
      ...(vaultIds?.length ? { vaultIds } : {}),
      ...(isCopilot
        ? {
            repo: process.env.GAMES_REPO?.trim() ?? 'gamedevpl/www.gamedev.pl-games',
            baseRef: process.env.GAMES_PUBLISHED_REF?.trim() || 'main',
            customAgent: process.env.AGENT_CUSTOM_AGENT?.trim() || 'game-builder',
            createPullRequest: false,
            // A separate, content-free repo for MCP-lane rounds — unset means today's
            // harness-only behavior is unchanged. See docs/managed-agent-backend.md.
            ...(process.env.MANAGED_AGENT_COPILOT_MCP_REPO?.trim()
              ? { mcpRepo: process.env.MANAGED_AGENT_COPILOT_MCP_REPO.trim() }
              : {}),
            ...(process.env.MANAGED_AGENT_COPILOT_MCP_BASE_REF?.trim()
              ? { mcpBaseRef: process.env.MANAGED_AGENT_COPILOT_MCP_BASE_REF.trim() }
              : {}),
            ...(process.env.MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT?.trim()
              ? { mcpCustomAgent: process.env.MANAGED_AGENT_COPILOT_MCP_CUSTOM_AGENT.trim() }
              : {}),
          }
        : {}),
      ...(!isCopilot && mcpUrl ? { overrideTools: true } : {}),
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
    ...(deps?.deliver ? { deliver: deps.deliver } : {}),
    ...(deps?.lock ? { lock: deps.lock } : {}),
    ...(mcpUrl && (needsMcpEndpoint || !isCopilot)
      ? { tools: { mcpEndpoints: [{ url: mcpUrl, name: 'gamedevpl' }] } }
      : {}),
    ...(mcpUrl && !isCopilot
      ? {
          mcpBearerCredential: (brief) =>
            brief.mcpOpenerToken ? { url: mcpUrl, token: brief.mcpOpenerToken } : undefined,
        }
      : {}),
    ...(deps?.systemPrompt ? { systemPrompt: deps.systemPrompt } : {}),
    ...(deps?.kitDigest ? { kitDigest: deps.kitDigest } : {}),
    ...(effort ? { effort } : {}),
    ...(promptLane ? { promptLane } : {}),
    ...(Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0 ? { maxDurationSeconds } : {}),
    ...(isCopilot && Number.isFinite(maxCopilotCredits) && maxCopilotCredits > 0
      ? { budget: { unit: 'credits' as const, max: maxCopilotCredits } }
      : {}),
    ...(isGemini && Number.isSafeInteger(maxTotalTokens) && maxTotalTokens > 0
      ? { budget: { unit: 'tokens' as const, max: maxTotalTokens } }
      : {}),
    deliveryMode,
    ...(log ? { log } : {}),
  });
}

/**
 * Builds the registry. Self is always available (no external credential); platform is
 * whatever {@link createManagedPlatformBackendFromEnv} resolves — the direct Copilot
 * backend (`copilot-backend.ts`) was retired in MP-04, so an unset or invalid
 * `MANAGED_AGENT_VENDOR` now means no platform builder, not a silent Copilot fallback.
 */
export function createAgentBackendRegistryFromEnv(
  log?: Logger,
  selfOptions?: SelfBuildBackendOptions,
  managedDeps?: ManagedBackendDeps,
): AgentBackendRegistry {
  const selectedVendor = process.env.MANAGED_AGENT_VENDOR?.trim();
  const platform = createManagedPlatformBackendFromEnv(managedDeps, log);
  const self = createSelfBuildBackend(selfOptions);
  if (selectedVendor && !platform) {
    log?.warn({ vendor: selectedVendor }, 'managed agent vendor is set but invalid; platform dispatch stays off');
  } else if (!platform) {
    log?.info({ backend: 'self' }, 'self-build backend enabled (no platform dispatch credential)');
  }
  return { ...(platform ? { platform } : {}), self };
}

/**
 * Returns the seeder, or undefined when this environment does not seed.
 *
 * Off unless `SEED_DISPATCH` is explicitly on. A default-on optimization that calls a
 * paid API on every creator submission is not something an environment should acquire by
 * upgrading, and local development in particular must keep working with no GCP
 * credentials at all — the seeder needs both Vertex and a games-repo read token, and
 * having neither is the normal state of a laptop.
 *
 * The read token is deliberately `GAMES_REPO_TOKEN` (what already reads the repo for
 * serving) rather than the dispatch PAT: assembling context is a read, and giving the
 * dispatch credential another job would widen what one expiry takes down.
 */
export function createGameSeederFromEnv(log?: Logger, knowledgeSearch?: QueryKnowledgeFn): GameSeeder | undefined {
  if (process.env.SEED_DISPATCH?.trim() !== 'true') return undefined;

  const token = process.env.GAMES_REPO_TOKEN?.trim() ?? process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim() ?? 'gamedevpl/www.gamedev.pl-games';
  const ref = process.env.GAMES_PUBLISHED_REF?.trim() || 'main';
  if (!token) {
    log?.warn({ repo }, 'seeding is enabled but no games-repo token is set; builds will not be seeded');
    return undefined;
  }

  const model = process.env.SEED_MODEL?.trim() || undefined;
  log?.info({ repo, ref, ...(model ? { model } : {}) }, 'seeded dispatch enabled');

  return new VertexGameSeeder({
    context: createArchiveSeedContextSource({ repo, ref, token, ...(log ? { log } : {}) }),
    ...(model ? { model } : {}),
    ...(log ? { log } : {}),
    ...(knowledgeSearch ? { knowledgeSearch } : {}),
  });
}
