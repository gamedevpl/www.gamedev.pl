// The incumbent seed provider — Gemini on Vertex, measured in llm-seed-spike.md.
//
// No apiKey: Vertex authenticates with ambient ADC, same as every other call site in
// genai.ts. This is also the reason round 0's legal argument holds today (ops:
// llm-seed-spike.md) — a stateless call through an existing processor, no keys anywhere.
// A non-Google provider spends that property; see seed-provider-anthropic.ts.

import { createVertexClient } from './genai.js';
import { registerSeedProvider, type SeedProviderConfig } from './seed-provider.js';

export const VERTEX_SEED_PROVIDER = 'vertex';

// Kept here rather than in game-seed.ts: it is this provider's default, not round 0's.
export const DEFAULT_VERTEX_SEED_MODEL = 'gemini-3.7-flash';

registerSeedProvider(VERTEX_SEED_PROVIDER, (config: SeedProviderConfig) =>
  createVertexClient({
    projectId: config.projectId,
    region: config.region,
    model: config.model,
    defaultRegion: 'global',
    defaultModel: DEFAULT_VERTEX_SEED_MODEL,
  }),
);
