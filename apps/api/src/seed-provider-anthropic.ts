// Anthropic as a seed provider — plain generation only, no MCP, no tool use (game-seed.ts
// never calls a tool). The managed builder already carries this vendor's credential and
// legal posture; a seed provider is a narrower ask of the same account, not a new one.

import { genaicode } from 'genaicode';
import { anthropic } from 'genaicode/providers';
import { registerSeedProvider, type SeedProviderConfig } from './seed-provider.js';

export const ANTHROPIC_SEED_PROVIDER = 'anthropic';

registerSeedProvider(ANTHROPIC_SEED_PROVIDER, (config: SeedProviderConfig) =>
  genaicode(
    anthropic({
      apiKey: config.apiKey,
      model: config.model,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    }),
  ),
);
