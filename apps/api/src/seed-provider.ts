// Registry of model vendors round 0 (game-seed.ts) can call.
//
// A provider here is nothing but a `GenAIClient` factory — not a full seeder. The fence
// transport, the path guard, the usable-draft test and the repair round are the actual
// containment story for generated content, and they stay in one place (game-seed.ts)
// shared by every provider, rather than being duplicated per vendor and left free to
// drift. Registering a vendor should be a factory call and a model id — see
// seed-provider-vertex.ts for the shape every other provider file copies.
//
// Mirrors managed-agent.ts's `registerManagedProvider` one size smaller: seeding is at
// most three plain text calls (pick, generate, a conditional repair) with no tool use, so
// there is no session lifecycle, no cancellation and no native usage-unit surface to
// abstract here — only "give me a client".

import type { GenAIClient } from 'genaicode';

export interface SeedProviderConfig {
  apiKey?: string;
  /** Resolved once at boot per vendor (agent-backend-env.ts), never guessed here. */
  model: string;
  // Vertex-only; ignored by every other provider.
  projectId?: string;
  region?: string;
  // openaiCompatible-shaped providers (a third-party vendor speaking the OpenAI wire
  // format) route through this instead of their vendor's default host.
  baseUrl?: string;
}

export type SeedProviderFactory = (config: SeedProviderConfig) => GenAIClient;

const factories = new Map<string, SeedProviderFactory>();

// Adding a vendor costs one registration line in its own seed-provider-<vendor>.ts.
export function registerSeedProvider(id: string, factory: SeedProviderFactory): void {
  factories.set(id, factory);
}

export function seedProviderIds(): string[] {
  return [...factories.keys()].sort();
}

export function isSeedProviderRegistered(id: string): boolean {
  return factories.has(id);
}

export function createSeedClient(id: string, config: SeedProviderConfig): GenAIClient {
  const factory = factories.get(id);
  if (!factory) {
    const known = seedProviderIds().join(', ') || '(none registered)';
    throw new Error(`unknown seed provider "${id}" — registered: ${known}`);
  }
  return factory(config);
}
