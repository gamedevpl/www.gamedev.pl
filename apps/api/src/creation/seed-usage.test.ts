import { describe, expect, it } from 'vitest';
import type { GenerationResult } from 'genaicode';
import { sumSeedUsage, usageOf } from './seed-usage.js';

describe('seed usage', () => {
  const result: GenerationResult = {
    parts: [],
    usage: { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 800 },
    raw: { usageMetadata: { candidatesTokenCount: 100, thoughtsTokenCount: 50 } },
  };

  it('records cache reads within input and bills Google thoughts once', () => {
    expect(usageOf(result, 'vertex', 'gemini')).toEqual({
      inputTokens: 1000,
      outputTokens: 150,
      cachedInputTokens: 800,
      model: 'gemini',
      provider: 'vertex',
    });
    expect(usageOf({ ...result, usage: { ...result.usage, outputTokens: 150 } }, 'vertex', 'gemini').outputTokens).toBe(
      150,
    );
    expect(usageOf(result, 'openai', 'model').outputTokens).toBe(100);
  });

  it('sums picker, generation and repair cache reads without doubling input', () => {
    const generated = usageOf(result, 'vertex', 'gemini');
    const picked = usageOf({ parts: [], usage: { inputTokens: 10, outputTokens: 2 } }, 'vertex', 'gemini');
    expect(sumSeedUsage(sumSeedUsage(picked, generated), generated)).toMatchObject({
      inputTokens: 2010,
      outputTokens: 302,
      cachedInputTokens: 1600,
    });
    expect(sumSeedUsage(picked, picked)).not.toHaveProperty('cachedInputTokens');
  });
});
