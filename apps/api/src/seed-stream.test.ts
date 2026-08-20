import { describe, expect, it } from 'vitest';
import { streamCollect } from './seed-stream.js';
import type { StreamEvent } from 'genaicode';

async function* chunks(pieces: string[]): AsyncGenerator<StreamEvent> {
  for (const piece of pieces) yield { type: 'text-delta', text: piece };
  yield {
    type: 'done',
    result: {
      parts: [{ type: 'text', text: pieces.join('') }],
      model: 'gemini-3.7-flash',
      usage: { inputTokens: 100, outputTokens: 50 },
    },
  };
}

describe('streamCollect', () => {
  it('collects the final result from the done event, same as a plain run() call', async () => {
    const result = await streamCollect(chunks(['--- games/x/game.ts ---\n', 'export {};\n']));

    expect(result.parts).toEqual([{ type: 'text', text: '--- games/x/game.ts ---\nexport {};\n' }]);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('works without a progress callback', async () => {
    await expect(streamCollect(chunks(['--- games/x/game.ts ---\nexport {};\n']))).resolves.toBeDefined();
  });

  it('reports each fence header once, in order, as the text streams in', async () => {
    const files: string[] = [];

    // Split mid-header on purpose.
    await streamCollect(
      chunks(['--- games/x/SPEC.md', ' ---\n# spec\n', '--- games/x/game.ts ---\nexport {};\n--- NOTES ---\nhi']),
      (file) => files.push(file),
    );

    expect(files).toEqual(['games/x/SPEC.md', 'games/x/game.ts', 'NOTES']);
  });

  it('finds every header even split one character at a time', async () => {
    const draft = '--- games/x/SPEC.md ---\n# spec\n--- games/x/game.ts ---\nexport {};\n--- NOTES ---\nhi';
    const files: string[] = [];

    await streamCollect(chunks([...draft]), (file) => files.push(file));

    expect(files).toEqual(['games/x/SPEC.md', 'games/x/game.ts', 'NOTES']);
  });
});
