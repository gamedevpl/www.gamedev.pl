// Builds round-0 seeding from the environment: vendors, then the seeder.

// Split out of agent-backend-env.ts: seeding is creation's question.

import { ModelGameSeeder, DEFAULT_SEED_PROVIDER, type GameSeeder } from './game-seed.js';
import { createArchiveSeedContextSource } from './seed-context.js';
import type { SeedProviderConfig } from './seed-provider.js';
import './seed-provider-vertex.js';
import './seed-provider-anthropic.js';
import './seed-provider-openai.js';
import './seed-provider-meta.js';
import './seed-provider-openrouter.js';
import { DEFAULT_VERTEX_SEED_MODEL } from './seed-provider-vertex.js';
import type { QueryKnowledgeFn } from './knowledge-search.js';
import type { GameSnapshotReader } from '../catalog/game-snapshot.js';

interface Logger {
  info: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
  error?: (context: object, message: string) => void; // Missing seeding is broken, not unusual.
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
