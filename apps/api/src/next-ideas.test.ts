import type { GenAIClient } from 'genaicode';
import { describe, expect, it } from 'vitest';
import { MAX_NEXT_IDEAS, StubNextIdeaGenerator, VertexNextIdeaGenerator, type NextIdea } from './next-ideas.js';

function fakeClient(result: unknown): GenAIClient {
  const builder = {
    temperature: () => builder,
    thinking: () => builder,
    signal: () => builder,
    json: async (parse?: (value: unknown) => unknown) => (parse ? parse(result) : result),
  };
  return (() => builder) as unknown as GenAIClient;
}

function throwingClient(err: unknown): GenAIClient {
  const builder = {
    temperature: () => builder,
    thinking: () => builder,
    signal: () => builder,
    json: async () => {
      throw err;
    },
  };
  return (() => builder) as unknown as GenAIClient;
}

const validParams = {
  spec: 'A top-down game where you dodge falling rocks in a canyon.',
  published: false,
};

describe('StubNextIdeaGenerator', () => {
  it('returns whatever it was constructed with', async () => {
    const ideas: NextIdea[] = [
      {
        id: 'idea_0',
        label: { en: 'More levels', pl: 'Więcej poziomów' },
        prompt: { en: 'Add more levels', pl: 'Dodaj więcej poziomów' },
      },
    ];
    const generator = new StubNextIdeaGenerator(ideas);
    await expect(generator.generate()).resolves.toEqual(ideas);
  });

  it('defaults to an empty array', async () => {
    await expect(new StubNextIdeaGenerator().generate()).resolves.toEqual([]);
  });
});

describe('VertexNextIdeaGenerator', () => {
  it('returns cleaned, capped ideas from a well-formed response', async () => {
    const raw = {
      ideas: Array.from({ length: MAX_NEXT_IDEAS + 2 }, (_, i) => ({
        label: { en: `Idea ${i}`, pl: `Pomysł ${i}` },
        prompt: { en: `Do idea ${i}`, pl: `Zrób pomysł ${i}` },
      })),
    };
    const generator = new VertexNextIdeaGenerator({ client: fakeClient(raw) });
    const ideas = await generator.generate(validParams);
    expect(ideas).toHaveLength(MAX_NEXT_IDEAS);
    expect(ideas[0]).toEqual({
      id: 'idea_0',
      label: { en: 'Idea 0', pl: 'Pomysł 0' },
      prompt: { en: 'Do idea 0', pl: 'Zrób pomysł 0' },
    });
  });

  it('drops an idea missing either language', async () => {
    const raw = {
      ideas: [
        { label: { en: 'English only' }, prompt: { en: 'English only prompt' } },
        { label: { en: 'Both', pl: 'Oba' }, prompt: { en: 'Both prompt', pl: 'Oba polecenie' } },
      ],
    };
    const generator = new VertexNextIdeaGenerator({ client: fakeClient(raw) });
    const ideas = await generator.generate(validParams);
    expect(ideas).toHaveLength(1);
    expect(ideas[0].label.en).toBe('Both');
  });

  it('truncates overlong label and prompt text', async () => {
    const raw = {
      ideas: [
        { label: { en: 'x'.repeat(200), pl: 'x'.repeat(200) }, prompt: { en: 'y'.repeat(500), pl: 'y'.repeat(500) } },
      ],
    };
    const generator = new VertexNextIdeaGenerator({ client: fakeClient(raw) });
    const [idea] = await generator.generate(validParams);
    expect(idea.label.en.length).toBeLessThanOrEqual(60);
    expect(idea.prompt.en.length).toBeLessThanOrEqual(300);
  });

  it('returns an empty array for a legitimately empty ideas list', async () => {
    const generator = new VertexNextIdeaGenerator({ client: fakeClient({ ideas: [] }) });
    await expect(generator.generate(validParams)).resolves.toEqual([]);
  });

  it('fails open (returns []) when the client throws', async () => {
    const generator = new VertexNextIdeaGenerator({ client: throwingClient(new Error('Vertex unavailable')) });
    await expect(generator.generate(validParams)).resolves.toEqual([]);
  });

  it('fails open (returns []) on a malformed, schema-invalid response', async () => {
    const generator = new VertexNextIdeaGenerator({ client: fakeClient({ ideas: 'not an array' }) });
    await expect(generator.generate(validParams)).resolves.toEqual([]);
  });

  it('never throws out of generate(), even for an unexpected exception', async () => {
    const generator = new VertexNextIdeaGenerator({ client: throwingClient('a non-Error rejection') });
    await expect(generator.generate(validParams)).resolves.toEqual([]);
  });

  it('asks in both languages regardless of the creator locale', async () => {
    const calls: string[] = [];
    const client = ((prompt: string) => {
      calls.push(prompt);
      return fakeClient({ ideas: [] })(prompt);
    }) as unknown as GenAIClient;
    const generator = new VertexNextIdeaGenerator({ client });
    await generator.generate({ ...validParams, locale: 'pl' });
    expect(calls[0]).toContain('"en"');
    expect(calls[0]).toContain('"pl"');
  });
});
