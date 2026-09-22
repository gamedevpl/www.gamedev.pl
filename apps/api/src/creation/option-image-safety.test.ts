import { describe, expect, it } from 'vitest';
import type { GenAIClient } from 'genaicode';
import { VertexOptionImageSafetyChecker } from './option-image-safety.js';

// Records what the builder was asked for, then replays one canned verdict.
function stubClient(
  outcome: { verdict?: unknown; throws?: Error },
  seen: { thinking: unknown[] } = { thinking: [] },
): GenAIClient {
  const chain = {
    temperature: () => chain,
    thinking: (arg: unknown) => {
      seen.thinking.push(arg);
      return chain;
    },
    signal: () => chain,
    json: async (parse: (value: unknown) => unknown) => {
      if (outcome.throws) throw outcome.throws;
      return parse(outcome.verdict);
    },
  };
  return (() => chain) as unknown as GenAIClient;
}

const IMAGE = Buffer.from('not-really-a-webp');

describe('VertexOptionImageSafetyChecker', () => {
  it('asks for the low thinking floor — the default under .json() is MINIMAL, which gemini-3.8-flash rejects with a 400', async () => {
    const seen = { thinking: [] as unknown[] };
    const checker = new VertexOptionImageSafetyChecker({ client: stubClient({ verdict: { safe: true } }, seen) });

    await checker.isSafe(IMAGE);

    expect(seen.thinking).toEqual([{ level: 'low' }]);
  });

  it('passes an image the classifier calls safe', async () => {
    const checker = new VertexOptionImageSafetyChecker({ client: stubClient({ verdict: { safe: true } }) });

    expect(await checker.isSafe(IMAGE)).toBe(true);
  });

  it('hides an image the classifier calls unsafe', async () => {
    const checker = new VertexOptionImageSafetyChecker({ client: stubClient({ verdict: { safe: false } }) });

    expect(await checker.isSafe(IMAGE)).toBe(false);
  });

  it('fails closed when the verdict body is not the agreed shape', async () => {
    const checker = new VertexOptionImageSafetyChecker({ client: stubClient({ verdict: { verdict: 'ok' } }) });

    expect(await checker.isSafe(IMAGE)).toBe(false);
  });

  it('fails closed when the call itself fails', async () => {
    const checker = new VertexOptionImageSafetyChecker({ client: stubClient({ throws: new Error('timeout') }) });

    expect(await checker.isSafe(IMAGE)).toBe(false);
  });
});
