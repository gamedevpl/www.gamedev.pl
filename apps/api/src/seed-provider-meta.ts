// Meta (Muse Spark) as a seed provider — the vendor that prompted this registry.
//
// Meta serves three protocols; genaicode speaks two of them (Chat Completions and an
// Anthropic-compatible Messages API), and neither documents a remote MCP client — which
// is exactly why this vendor is usable *here* and not in architecture C (ops:
// managed-agents-backend-spike.md). Chat Completions is Meta's own recommended surface
// for "single-shot ... turns that plug into existing OpenAI code without reasoning
// continuity", which describes round 0 exactly: two bounded calls, no tools, no
// multi-turn state. `openaiCompatible` is genaicode's factory for a third party speaking
// that wire format under its own base URL.
//
// Four documented `HTTP 400` traps, encoded here rather than left for a caller to
// rediscover — the same class of failure as `thinkingBudget: 0` 400ing on
// gemini-3.7-flash:
//
//  - `reasoning_effort: "none"` is refused outright; Muse Spark always reasons. Nothing
//    here sets it, and nothing should — nothing in this module can turn reasoning off.
//  - `stop` is not supported on reasoning models.
//  - `n > 1` (parallel sampling) is refused; genaicode never sends more than one.
//  - The output ceiling is `max_completion_tokens`, not `max_tokens` — genaicode's
//    OpenAI converter already names it correctly; nothing to do here.
//
// Registered, not selected: `configuredSeedProviders` only includes this id once
// `SEED_META_API_KEY` and `SEED_META_MODEL` are both set (agent-backend-env.ts), and that
// is itself gated on the sub-processor / credential-ledger steps in
// ops: seed-provider-selection-plan.md before it is ever the value operators see offered.

import { genaicode } from 'genaicode';
import { openaiCompatible } from 'genaicode/providers';
import { registerSeedProvider, type SeedProviderConfig } from './seed-provider.js';

export const META_SEED_PROVIDER = 'meta';

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
