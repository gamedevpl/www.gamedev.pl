// OpenAI as a seed provider — genaicode's `openai()` speaks Chat Completions
// (`client.chat.completions.create`), which is the right surface for round 0's
// single-shot, no-tool-use calls (see game-seed.ts and ops: seed-provider-selection-plan.md
// on why the pick/generate/repair shape needs no more than that).

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
