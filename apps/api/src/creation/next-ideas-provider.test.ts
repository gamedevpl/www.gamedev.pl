import type { GenAIClient } from 'genaicode';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEXT_IDEAS_MODEL, NEXT_IDEAS_GEMINI_MODEL, NextIdeaModelGenerator } from './next-ideas.js';

const answer = { ideas: [{ label: { en: 'Fog', pl: 'Mgła' }, prompt: { en: 'Add fog.', pl: 'Dodaj mgłę.' } }] };

// One fake per model; `fail` lists models whose draw throws.
function fakeClients(fail: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const clientFor = vi.fn((model: string) => {
    const chain = {
      temperature: () => chain,
      thinking: () => chain,
      signal: () => chain,
      json: async (parse: (value: unknown) => unknown) => {
        calls.push(model);
        if (model in fail) throw fail[model];
        return parse(answer);
      },
    };
    return (() => chain) as unknown as GenAIClient;
  });
  return { clientFor, calls };
}

const base = { spec: 'Top-down Great War trench warfare.', published: false };

describe('NextIdeaModelGenerator providers', () => {
  it('defaults to Claude with Gemini as the fallback when a key is set', () => {
    const generator = new NextIdeaModelGenerator({ env: { SEED_ANTHROPIC_API_KEY: 'k' } });
    expect(generator.model).toBe(DEFAULT_NEXT_IDEAS_MODEL);
    expect(generator.model.startsWith('claude-')).toBe(true);
    expect(generator.fallbackModel).toBe(NEXT_IDEAS_GEMINI_MODEL);
  });

  it('switches back to Gemini through DREAM_IDEAS_MODEL, with no fallback', () => {
    const generator = new NextIdeaModelGenerator({
      env: { DREAM_IDEAS_MODEL: 'gemini-3.8-flash', ANTHROPIC_API_KEY: 'k', VERTEX_MODEL: 'gemini-2.5-flash' },
    });
    expect(generator.model).toBe('gemini-3.8-flash');
    expect(generator.fallbackModel).toBeUndefined();
  });

  it('ignores VERTEX_MODEL for the ideas model', () => {
    const generator = new NextIdeaModelGenerator({ env: { ANTHROPIC_API_KEY: 'k', VERTEX_MODEL: 'gemini-2.5-flash' } });
    expect(generator.model).toBe(DEFAULT_NEXT_IDEAS_MODEL);
  });

  it('uses Gemini directly when no Anthropic key is configured', async () => {
    const { clientFor, calls } = fakeClients();
    const onAttempt = vi.fn();
    const generator = new NextIdeaModelGenerator({ clientFor, env: {} });
    expect(generator.model).toBe(NEXT_IDEAS_GEMINI_MODEL);
    expect(await generator.generate({ ...base, onAttempt })).toHaveLength(1);
    expect(calls).toEqual([NEXT_IDEAS_GEMINI_MODEL]);
    expect(onAttempt.mock.calls).toEqual([[NEXT_IDEAS_GEMINI_MODEL]]);
  });

  it('asks Claude first and books that one attempt', async () => {
    const { clientFor, calls } = fakeClients();
    const onAttempt = vi.fn();
    const generator = new NextIdeaModelGenerator({ clientFor, env: { ANTHROPIC_API_KEY: 'k' } });
    expect(await generator.generate({ ...base, onAttempt })).toHaveLength(1);
    expect(calls).toEqual([DEFAULT_NEXT_IDEAS_MODEL]);
    expect(onAttempt.mock.calls).toEqual([[DEFAULT_NEXT_IDEAS_MODEL]]);
  });

  it('falls back to Gemini when Claude keeps failing retryably', async () => {
    const overloaded = Object.assign(new Error('overloaded'), { status: 529 });
    const { clientFor, calls } = fakeClients({ [DEFAULT_NEXT_IDEAS_MODEL]: overloaded });
    const onAttempt = vi.fn();
    const generator = new NextIdeaModelGenerator({ clientFor, env: { ANTHROPIC_API_KEY: 'k' } });
    const ideas = await generator.generate({ ...base, onAttempt });
    expect(ideas.map((idea) => idea.label.en)).toEqual(['Fog']);
    expect(calls).toEqual([DEFAULT_NEXT_IDEAS_MODEL, DEFAULT_NEXT_IDEAS_MODEL, NEXT_IDEAS_GEMINI_MODEL]);
    // Each billed call is named by the model that ran it.
    expect(onAttempt.mock.calls).toEqual([
      [DEFAULT_NEXT_IDEAS_MODEL],
      [DEFAULT_NEXT_IDEAS_MODEL],
      [NEXT_IDEAS_GEMINI_MODEL],
    ]);
  });

  it('does not fall back on a non-retryable Claude error', async () => {
    const unauthorized = Object.assign(new Error('invalid x-api-key'), { status: 401 });
    const { clientFor, calls } = fakeClients({ [DEFAULT_NEXT_IDEAS_MODEL]: unauthorized });
    const generator = new NextIdeaModelGenerator({ clientFor, env: { ANTHROPIC_API_KEY: 'k' } });
    expect(await generator.generate(base)).toEqual([]);
    expect(calls).toEqual([DEFAULT_NEXT_IDEAS_MODEL]);
  });
});
