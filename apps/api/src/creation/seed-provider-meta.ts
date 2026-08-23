// Meta (Muse Spark) as a seed provider, over Chat Completions.

import { genaicode } from 'genaicode';
import { openaiCompatible } from 'genaicode/providers';
import { registerSeedProvider, type SeedProviderConfig } from './seed-provider.js';

export const META_SEED_PROVIDER = 'meta';

// Muse Spark always reasons; reasoning_effort "none" 400s. Never set it here.
export const DEFAULT_META_BASE_URL = 'https://api.meta.ai/v1';

registerSeedProvider(META_SEED_PROVIDER, (config: SeedProviderConfig) =>
  genaicode(
    openaiCompatible({
      name: 'meta',
      apiKey: config.apiKey,
      model: config.model,
      baseURL: config.baseUrl ?? DEFAULT_META_BASE_URL,
    }),
  ),
);
