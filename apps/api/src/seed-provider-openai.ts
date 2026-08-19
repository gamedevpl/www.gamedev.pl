// OpenAI as a seed provider, over Chat Completions.

import { genaicode } from 'genaicode';
import { openai } from 'genaicode/providers';
import { registerSeedProvider, type SeedProviderConfig } from './seed-provider.js';

export const OPENAI_SEED_PROVIDER = 'openai';

registerSeedProvider(OPENAI_SEED_PROVIDER, (config: SeedProviderConfig) =>
  genaicode(
    openai({
      apiKey: config.apiKey,
      model: config.model,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    }),
  ),
);
