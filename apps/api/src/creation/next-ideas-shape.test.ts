import type { GenAIClient } from 'genaicode';
import { describe, expect, it } from 'vitest';
import { NextIdeaModelGenerator } from './next-ideas.js';

// A client that answers every draw with one fixed JSON value.
function answering(value: unknown, prompts: string[] = []): () => GenAIClient {
  const client = ((request: unknown) => {
    prompts.push(typeof request === 'string' ? request : JSON.stringify(request));
    const chain = {
      temperature: () => chain,
      thinking: () => chain,
      signal: () => chain,
      json: async (parse: (raw: unknown) => unknown) => parse(value),
    };
    return chain;
  }) as unknown as GenAIClient;
  return () => client;
}

const params = { spec: 'Arena brawler.', title: 'Arena Brawlers', published: false };

describe('NextIdeaModelGenerator answer shape', () => {
  it('asks for flat label and prompt fields', async () => {
    const prompts: string[] = [];
    await new NextIdeaModelGenerator({ clientFor: answering({ ideas: [] }, prompts), env: {} }).generate(params);
    expect(prompts[0]).toContain('"label_en": "...", "label_pl": "...", "prompt_en": "...", "prompt_pl": "..."');
  });

  it('reads the flat shape', async () => {
    const flat = { ideas: [{ label_en: 'Fog', label_pl: 'Mgła', prompt_en: 'Add fog.', prompt_pl: 'Dodaj mgłę.' }] };
    const ideas = await new NextIdeaModelGenerator({ clientFor: answering(flat), env: {} }).generate(params);
    expect(ideas).toEqual([
      { id: 'idea_0', label: { en: 'Fog', pl: 'Mgła' }, prompt: { en: 'Add fog.', pl: 'Dodaj mgłę.' } },
    ]);
  });

  it('still reads the nested shape a model may send', async () => {
    const nested = { ideas: [{ label: { en: 'Fog', pl: 'Mgła' }, prompt: { en: 'Add fog.', pl: 'Dodaj mgłę.' } }] };
    const ideas = await new NextIdeaModelGenerator({ clientFor: answering(nested), env: {} }).generate(params);
    expect(ideas.map((idea) => idea.label.en)).toEqual(['Fog']);
  });
});
