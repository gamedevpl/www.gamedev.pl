import { describe, expect, it } from 'vitest';
import { priceTokens, rateForModel } from './token-prices.js';

describe('priceTokens', () => {
  it('converts a million tokens each way at the published rate', () => {
    const priced = priceTokens({ input: 1_000_000, output: 1_000_000, vendor: 'anthropic', model: 'claude-sonnet-5' });

    expect(priced?.usd).toBeCloseTo(18, 10);
  });

  it('reports a model it has no rate for as unpriced rather than free', () => {
    // A zero here would be spending that vanishes while looking measured.
    expect(priceTokens({ input: 5_000_000, output: 1_000_000, model: 'some-model-we-never-priced' })).toBeUndefined();
  });

  it('falls back to the entry model when the token shape carries none', () => {
    // Seed rows leave the model on the entry's `by`.
    const priced = priceTokens({ input: 1_000_000, output: 0 }, 'claude-sonnet-5');

    expect(priced?.usd).toBeCloseTo(3, 10);
  });

  it('flags a bare token shape as a bound, because cache reads hide inside its input count', () => {
    const bare = priceTokens({ input: 1_000_000, output: 0, model: 'claude-sonnet-5' });
    expect(bare?.pricedExactly).toBe(false);

    const withCacheSplit = priceTokens({
      vendor: 'gemini',
      model: 'claude-sonnet-5',
      input: 1_000_000,
      output: 0,
      total: 1_000_000,
      thought: 0,
      cached: 0,
      toolUse: 0,
    });
    expect(withCacheSplit?.pricedExactly).toBe(true);
  });

  it('never prices negatively when a vendor reports more cached tokens than input', () => {
    const priced = priceTokens({
      vendor: 'openai',
      model: 'claude-sonnet-5',
      input: 100,
      output: 0,
      total: 100,
      reasoning: 0,
      cached: 900,
    });

    expect(priced?.usd).toBeGreaterThanOrEqual(0);
  });

  it('prices cached input at its own rate, and calls that exact', () => {
    // The gemini shape reports cache reads separately.
    const priced = priceTokens({
      vendor: 'gemini',
      model: 'gemini-3.8-flash',
      input: 1_000_000,
      output: 0,
      total: 1_000_000,
      thought: 0,
      cached: 800_000,
      toolUse: 0,
    });

    // 200k fresh at $1.50 plus 800k cached at $0.15.
    expect(priced?.usd).toBeCloseTo(0.3 + 0.12, 10);
    expect(priced?.pricedExactly).toBe(true);
  });

  it('matches a model id whatever case it arrives in', () => {
    expect(rateForModel('Claude-Sonnet-5')).toEqual(rateForModel('claude-sonnet-5'));
    expect(rateForModel(undefined)).toBeUndefined();
  });
});
