// OpenRouter as a seed provider, over its OpenAI-compatible Chat Completions API.

import { genaicode } from 'genaicode';
import { openaiCompatible } from 'genaicode/providers';
import { registerSeedProvider, type SeedProviderConfig } from './seed-provider.js';

export const OPENROUTER_SEED_PROVIDER = 'openrouter';

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

registerSeedProvider(OPENROUTER_SEED_PROVIDER, (config: SeedProviderConfig) =>
  genaicode(
    openaiCompatible({
      name: 'openrouter',
      apiKey: config.apiKey,
      model: config.model,
      baseURL: config.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL,
    }),
  ),
);
