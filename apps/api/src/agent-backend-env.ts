// Builds the coding-agent backend registry from the environment.
//
// Kept apart from app.ts so that "which backend, configured how" is one readable
// decision rather than a branch buried in server wiring — and so a second backend can be
// added here without touching the server at all.

import type { AgentBackend } from './agent-backend.js';
import type { BuilderKind } from './builder.js';
import { createAgentTasksClient, type AgentTaskModel } from './agent-tasks.js';
import { createCopilotBackend } from './copilot-backend.js';
import { VertexGameSeeder, type GameSeeder } from './game-seed.js';
import { createGitHubClient } from './github-client.js';
import { createManagedProvider, type ManagedAgentEffort } from './managed-agent.js';
import './managed-provider-anthropic.js';
import { createManagedBackend, type ManagedDeliverySink } from './managed-backend.js';
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

/**
 * Returns a platform backend, or undefined when this environment is not set up to
 * dispatch Copilot.
 *
 * Undefined is a supported state, not a failure: local development has no dispatch
 * credential, and an environment can run the whole product without one — self builds
 * still work, and submissions that ask for the platform builder wait in `queued`.
 */
// What the managed backend needs that the environment cannot supply.
export interface ManagedBackendDeps {
  deliver: ManagedDeliverySink;
  systemPrompt?: () => Promise<string | undefined>;
}

// Vendor is a variable; a delivery sink is required.
export function createManagedPlatformBackendFromEnv(deps?: ManagedBackendDeps, log?: Logger): AgentBackend | undefined {
  const vendor = process.env.MANAGED_AGENT_VENDOR?.trim();
  if (!vendor) return undefined;

  const apiKey = process.env.MANAGED_AGENT_API_KEY?.trim();
  const model = process.env.MANAGED_AGENT_MODEL?.trim();
  if (!apiKey || !model) {
    log?.warn({ vendor }, 'managed agent vendor is set but MANAGED_AGENT_API_KEY / MANAGED_AGENT_MODEL are missing');
    return undefined;
  }
  if (!deps?.deliver) {
    log?.warn({ vendor }, 'managed agent vendor is set but no delivery sink was supplied');
    return undefined;
  }

  const effort = process.env.MANAGED_AGENT_EFFORT?.trim() as ManagedAgentEffort | undefined;
  const maxDurationSeconds = Number(process.env.MANAGED_AGENT_MAX_SECONDS ?? '');
  const deliveryMode = process.env.MANAGED_AGENT_DELIVERY_MODE?.trim() === 'publish' ? 'publish' : 'preview';

  let provider;
  try {
    provider = createManagedProvider(vendor, {
      apiKey,
      model,
      ...(process.env.MANAGED_AGENT_BASE_URL?.trim() ? { baseUrl: process.env.MANAGED_AGENT_BASE_URL.trim() } : {}),
    });
  } catch (error) {
    log?.warn({ err: error, vendor }, 'could not build the managed agent provider; platform dispatch stays off');
    return undefined;
  }

  log?.info({ vendor, model, deliveryMode, backend: `managed:${vendor}` }, 'managed agent dispatch enabled');

  return createManagedBackend({
    provider,
    deliver: deps.deliver,
    ...(deps.systemPrompt ? { systemPrompt: deps.systemPrompt } : {}),
    ...(effort ? { effort } : {}),
    ...(Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0 ? { maxDurationSeconds } : {}),
    deliveryMode,
    ...(log ? { log } : {}),
  });
}

export function createPlatformBackendFromEnv(log?: Logger): AgentBackend | undefined {
  // Deliberately its own credential rather than reusing GITHUB_TOKEN. The agent tasks
  // API needs a user-to-server token (installation tokens are unsupported), and keeping
  // it separate means dispatch and serving fail independently — a dispatch PAT expiring
  // must not take the catalog down with it, which is exactly the shared-budget coupling
  // that 403'd two jobs at once on 2026-07-28.
  const token = process.env.AGENT_TASKS_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim() ?? 'gamedevpl/www.gamedev.pl-games';
  if (!token) return undefined;

  const model = (process.env.AGENT_TASKS_MODEL?.trim() as AgentTaskModel | undefined) ?? 'claude-sonnet-4.6';

  log?.info({ repo, model, backend: 'copilot' }, 'agent dispatch enabled');

  return createCopilotBackend({
    tasks: createAgentTasksClient({ token, repo }),
    // Deletes spent workspaces, and commits a generated seed onto the branch a seeded
    // build starts from.
    github: createGitHubClient({ token, repo }),
    baseRef: process.env.GAMES_PUBLISHED_REF?.trim() || 'main',
    model,
    customAgent: process.env.AGENT_CUSTOM_AGENT?.trim() || 'game-builder',
    // Delivery is by upload; a pull request is opened lazily, only when a revision round
    // needs one as resumption context.
    createPullRequest: false,
    ...(log ? { log } : {}),
  });
}

/**
 * Builds the registry. Self is always available (no external credential); platform
 * follows {@link createPlatformBackendFromEnv}.
 */
export function createAgentBackendRegistryFromEnv(
  log?: Logger,
  selfOptions?: SelfBuildBackendOptions,
  managedDeps?: ManagedBackendDeps,
): AgentBackendRegistry {
  // A configured managed vendor takes the platform slot; routing above is unchanged.
  const platform = createManagedPlatformBackendFromEnv(managedDeps, log) ?? createPlatformBackendFromEnv(log);
  const self = createSelfBuildBackend(selfOptions);
  if (!platform) {
    log?.info({ backend: 'self' }, 'self-build backend enabled (no platform dispatch credential)');
  }
  return { ...(platform ? { platform } : {}), self };
}

/**
 * @deprecated Prefer {@link createAgentBackendRegistryFromEnv}. Kept so older call sites
 * that expect a single backend still resolve the platform adapter.
 */
export function createAgentBackendFromEnv(log?: Logger): AgentBackend | undefined {
  return createPlatformBackendFromEnv(log);
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
export function createGameSeederFromEnv(log?: Logger): GameSeeder | undefined {
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
  });
}
