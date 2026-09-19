import type { AgentSessionTokens } from './job-state.js';

// Token twin of USD_PER_CREDIT: published list rates, so conversion estimates nothing.

// Bumped on any rate change, and reported beside the money it produced.
export const TOKEN_PRICE_TABLE_VERSION = '2026-09-15';

export interface TokenRate {
  inputPerMTok: number;
  outputPerMTok: number;
  // Absent means the discount is unknown, never that there is none.
  cachedInputPerMTok?: number;
}

// Keyed on model: `by` holds a backend name on some kinds.
const RATES: Readonly<Record<string, TokenRate>> = {
  'claude-sonnet-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },

  // Vertex standard tier, not the halved Gemini API introductory tier.

  // Matches our own bill: see A25 in infra/setup-monitoring.sh.
  'gemini-3.8-flash': { inputPerMTok: 1.5, outputPerMTok: 7.5, cachedInputPerMTok: 0.15 },
  'gemini-3.7-flash': { inputPerMTok: 1.5, outputPerMTok: 7.5, cachedInputPerMTok: 0.15 },

  // Published rate, uncorroborated by our bill: flash dominates A25's blend.
  'gemini-3.5-flash-lite': { inputPerMTok: 0.3, outputPerMTok: 2.5 },

  // gemini-3.1-flash-image bills per image, not per token.
};

export interface TokenPrice {
  usd: number;
  // False when cache reads hide inside `input`, making it a bound.
  pricedExactly: boolean;
}

export function rateForModel(model: string | undefined): TokenRate | undefined {
  if (!model) return undefined;
  return RATES[model.trim().toLowerCase()];
}

// Undefined, never 0: unpriced must not read as free.
export function priceTokens(tokens: AgentSessionTokens, fallbackModel?: string): TokenPrice | undefined {
  const rate = rateForModel(modelOf(tokens, fallbackModel));
  if (!rate) return undefined;

  const cached = 'cached' in tokens ? tokens.cached : 0;
  // `input` already includes the cached portion.
  const fresh = Math.max(0, tokens.input - cached);
  const cachedRate = rate.cachedInputPerMTok ?? rate.inputPerMTok;

  const usd =
    (fresh * rate.inputPerMTok) / 1_000_000 +
    (cached * cachedRate) / 1_000_000 +
    (tokens.output * rate.outputPerMTok) / 1_000_000;

  return { usd, pricedExactly: 'cached' in tokens };
}

// Seed rows leave the model on the entry's `by`.
export function modelOf(tokens: AgentSessionTokens, fallbackModel?: string): string | undefined {
  const model = tokens.model ?? fallbackModel;
  return model?.trim() || undefined;
}
