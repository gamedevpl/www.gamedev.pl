import type { GenAIClient } from 'genaicode';
import { describe, expect, it, vi } from 'vitest';
import { NEXT_IDEAS_GEMINI_MODEL, NextIdeaModelGenerator } from './next-ideas.js';

// Records what the model was asked; answers one idea.
function fakeClient() {
  const requests: unknown[] = [];
  const chain = {
    temperature: () => chain,
    thinking: () => chain,
    signal: () => chain,
    json: async (parse: (value: unknown) => unknown) =>
      parse({ ideas: [{ label: { en: 'Craters', pl: 'Leje' }, prompt: { en: 'Add craters.', pl: 'Dodaj leje.' } }] }),
  };
  const client = vi.fn((request: unknown) => {
    requests.push(request);
    return chain;
  });
  return { client: client as unknown as GenAIClient, requests };
}

const base = { spec: 'Top-down Great War trench warfare.', title: 'Trenchline Command', published: false };

describe('NextIdeaModelGenerator prompt', () => {
  it('shows the model the current game and its recent rounds', async () => {
    const { client, requests } = fakeClient();
    const ideas = await new NextIdeaModelGenerator({ clientFor: () => client, env: {} }).generate({
      ...base,
      screenshotPng: 'QUFB',
      history: ['Creator asked: add artillery', 'Delivered: artillery strikes on Q'],
    });
    expect(ideas).toHaveLength(1);
    const request = requests[0] as { text: string; images: Array<{ data: string; mediaType: string }> };
    expect(request.images).toEqual([{ data: 'QUFB', mediaType: 'image/png' }]);
    expect(request.text).toContain('- Delivered: artillery strikes on Q');
    expect(request.text).toContain('real screenshot of the game as it is now');
    expect(request.text).toContain('never propose it again');
    expect(request.text).toContain('Visible in the game world');
    expect(request.text).toContain('One focused change a builder can finish in a single round');
  });

  it('stays a plain text prompt without a screenshot', async () => {
    const { client, requests } = fakeClient();
    await new NextIdeaModelGenerator({ clientFor: () => client, env: {} }).generate(base);
    expect(typeof requests[0]).toBe('string');
    expect(requests[0]).not.toContain('Recent rounds');
  });

  it('draws again after malformed JSON and reports the extra billed call', async () => {
    let calls = 0;
    const chain = {
      temperature: () => chain,
      thinking: () => chain,
      signal: () => chain,
      json: async (parse: (value: unknown) => unknown) => {
        calls += 1;
        if (calls === 1) throw new SyntaxError('Expected double-quoted property name in JSON at position 545');
        return parse({ ideas: [{ label: { en: 'Fog', pl: 'Mgła' }, prompt: { en: 'Add fog.', pl: 'Dodaj mgłę.' } }] });
      },
    };
    const client = vi.fn(() => chain) as unknown as GenAIClient;
    const onAttempt = vi.fn();
    const ideas = await new NextIdeaModelGenerator({ clientFor: () => client, env: {} }).generate({
      ...base,
      onAttempt,
    });
    expect(ideas.map((idea) => idea.label.en)).toEqual(['Fog']);
    expect(onAttempt.mock.calls).toEqual([[NEXT_IDEAS_GEMINI_MODEL], [NEXT_IDEAS_GEMINI_MODEL]]);
  });

  it('gives the first draw at least the whole configured budget', async () => {
    const budgets: number[] = [];
    const chain = {
      temperature: () => chain,
      thinking: () => chain,
      signal: (signal: AbortSignal) => {
        void signal;
        return chain;
      },
      json: async (parse: (value: unknown) => unknown) =>
        parse({ ideas: [{ label: { en: 'Fog', pl: 'Mgła' }, prompt: { en: 'Add fog.', pl: 'Dodaj mgłę.' } }] }),
    };
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      budgets.push(ms);
      return new AbortController().signal;
    });
    const client = vi.fn(() => chain) as unknown as GenAIClient;
    await new NextIdeaModelGenerator({ clientFor: () => client, env: {}, timeoutMs: 45_000 }).generate(base);
    timeout.mockRestore();
    expect(budgets[0]).toBeGreaterThanOrEqual(45_000);
  });
});
