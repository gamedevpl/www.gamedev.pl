// Registry of model vendors round 0 (game-seed.ts) can call.

import type { GenAIClient } from 'genaicode';

// A provider is just a client factory; the seeder itself lives elsewhere.
export interface SeedProviderConfig {
  apiKey?: string;
  // Resolved once at boot per vendor (agent-backend-env.ts).
  model: string;
  // Vertex-only; ignored by every other provider.
  projectId?: string;
  region?: string;
  // For openaiCompatible-shaped providers, a third party's own host.
  baseUrl?: string;
  // Below the vendor's own ceiling, every generate call rejects outright.
  maxOutputTokens?: number;
  // Raises the pick call above its default for reasoning vendors.
  pickMaxOutputTokens?: number;
}

export type SeedProviderFactory = (config: SeedProviderConfig) => GenAIClient;

const factories = new Map<string, SeedProviderFactory>();

// Adding a vendor is one registration line, in its own file.
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
