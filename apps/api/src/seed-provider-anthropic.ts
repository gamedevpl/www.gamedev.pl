// Anthropic as a seed provider: plain generation, no tools needed.

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
