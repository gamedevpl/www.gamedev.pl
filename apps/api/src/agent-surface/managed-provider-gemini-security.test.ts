import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createGeminiManagedProvider } from './managed-provider-gemini.js';

describe('gemini managed provider logging', () => {
  it('does not log response content when a new interaction is unreadable', async () => {
    const roundToken = `round-${randomUUID()}`;
    const privateSource = `source-${randomUUID()}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: null,
            echoed: { headers: { Authorization: `Bearer ${roundToken}` }, content: privateSource },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const provider = createGeminiManagedProvider({
      apiKey: `api-${randomUUID()}`,
      model: 'gemini-test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      provider.startSession({
        correlationId: '42',
        prompt: 'build it',
        model: 'gemini-test-model',
        outputPath: 'outputs',
      }),
    ).rejects.toThrow('gemini managed agents returned an unreadable interaction');

    expect(JSON.stringify(warn.mock.calls)).not.toContain(roundToken);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(privateSource);
    warn.mockRestore();
  });
});
