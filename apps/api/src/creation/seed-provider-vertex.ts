// The incumbent seed provider: Gemini on Vertex.

import { createVertexClient } from '../platform/genai.js';
import { registerSeedProvider, type SeedProviderConfig } from './seed-provider.js';

export const VERTEX_SEED_PROVIDER = 'vertex';

// No apiKey: Vertex authenticates with ambient ADC, unlike every other provider here.
export const DEFAULT_VERTEX_SEED_MODEL = 'gemini-3.5-flash-lite';

registerSeedProvider(VERTEX_SEED_PROVIDER, (config: SeedProviderConfig) =>
  createVertexClient({
    projectId: config.projectId,
    region: config.region,
    model: config.model,
    defaultRegion: 'global',
    defaultModel: DEFAULT_VERTEX_SEED_MODEL,
  }),
);
