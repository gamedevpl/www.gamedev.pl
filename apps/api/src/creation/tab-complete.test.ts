import { describe, expect, it, vi } from 'vitest';

// A real call once burned the output cap on invisible thinking tokens.
const createVertexClient = vi.fn(() => vi.fn());
vi.mock('../agent-surface/genai.js', () => ({ createVertexClient }));

const { MAX_COMPLETION_OUTPUT_TOKENS, StubTabCompleter, tabCompleteEnabled, VertexTabCompleter } =
  await import('./tab-complete.js');

// Same stub shape as the code lane test uses: real usage included.
function stubClient(text: string, usage = { inputTokens: 42, outputTokens: 7 }) {
  const prompts: string[] = [];
  const maxOutputTokensCalls: unknown[] = [];
  const client = ((prompt: string) => {
    prompts.push(prompt);
    const chain = {
      temperature: () => chain,
      maxOutputTokens: (n: unknown) => {
        maxOutputTokensCalls.push(n);
        return chain;
      },
      signal: () => chain,
      run: () => Promise.resolve({ parts: [{ type: 'text', text }], usage }),
    };
    return chain;
  }) as never;
  return { client, prompts, maxOutputTokensCalls };
}

describe('VertexTabCompleter', () => {
  it('assembles prefix and suffix into one prompt and reports tokens', async () => {
    const { client, prompts } = stubClient('const speed = 0.16;');
    const completer = new VertexTabCompleter({ client });

    const result = await completer.complete({
      path: 'game/runtime.ts',
      prefixWindow: 'function startGame() {\n  ',
      suffixWindow: '\n}\n',
    });

    expect(result.completion).toBe('const speed = 0.16;');
    expect(result.tokens).toEqual({ input: 42, output: 7 });
    expect(prompts[0]).toContain('function startGame() {');
    expect(prompts[0]).toContain('\n}\n');
    expect(prompts[0]).toContain('game/runtime.ts');
  });

  it('caps output tokens so one proposal cannot blow the daily budget', async () => {
    const { client, maxOutputTokensCalls } = stubClient('x');
    await new VertexTabCompleter({ client }).complete({ path: 'a.ts', prefixWindow: '', suffixWindow: '' });
    expect(maxOutputTokensCalls).toEqual([MAX_COMPLETION_OUTPUT_TOKENS]);
  });

  it('strips a stray markdown fence the model added despite the instruction', async () => {
    const { client } = stubClient('```typescript\nconst x = 1;\n```');
    const result = await new VertexTabCompleter({ client }).complete({
      path: 'a.ts',
      prefixWindow: '',
      suffixWindow: '',
    });
    expect(result.completion).toBe('const x = 1;');
  });

  it('preserves boundary whitespace an unfenced completion needs', async () => {
    const { client } = stubClient(' value');
    const result = await new VertexTabCompleter({ client }).complete({
      path: 'a.ts',
      prefixWindow: 'return',
      suffixWindow: ';',
    });
    // A trim() here would corrupt "return" + " value" into "returnvalue".
    expect(result.completion).toBe(' value');
  });

  it('disables thinking on the real Vertex client — thinking tokens starve the visible answer', async () => {
    await new VertexTabCompleter().complete({ path: 'a.ts', prefixWindow: '', suffixWindow: '' }).catch(() => {});
    expect(createVertexClient).toHaveBeenCalledWith(
      expect.objectContaining({ generationConfig: { thinkingConfig: { thinkingBudget: 0 } } }),
    );
  });
});

describe('StubTabCompleter', () => {
  it('returns a fixed result for tests and Vertex-less local runs', async () => {
    const completer = new StubTabCompleter({ completion: 'return 0;' });
    await expect(completer.complete()).resolves.toEqual({ completion: 'return 0;' });
  });
});

describe('tabCompleteEnabled', () => {
  it('is off unless the deploy flag says exactly true — opposite default from CODE_SURFACE', () => {
    expect(tabCompleteEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(tabCompleteEnabled({ TAB_COMPLETE: '1' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(tabCompleteEnabled({ TAB_COMPLETE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
