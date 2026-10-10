import { expect, it, vi } from 'vitest';
import { codeCompletion, type CodeProvider } from './workbench-code-completion.js';
const env = { OPENAI_API_KEY: 'mock-openai', ANTHROPIC_API_KEY: 'mock-anthropic', GEMINI_API_KEY: 'mock-google' };
it('detects only availability, stays off until explicit consent and never exposes keys', async () => {
  const fetch = vi.fn();
  const completion = codeCompletion(env, fetch);
  expect(JSON.stringify(completion.status())).not.toContain('mock-');
  expect(completion.status().selected).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  await expect(completion.complete('code', '')).rejects.toThrow('Enable');
  expect(() => completion.select('openai', false)).toThrow('consent');
  expect(() => codeCompletion({}).select('openai', true)).toThrow('unavailable');
  expect(fetch).not.toHaveBeenCalled();
});
it.each<CodeProvider>(['openai', 'anthropic', 'google'])(
  'uses the opted-in %s provider with a mock',
  async (provider) => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: ' = 1;' } }],
            content: [{ text: ' = 1;' }],
            candidates: [{ content: { parts: [{ text: ' = 1;' }] } }],
          }),
        ),
    );
    const completion = codeCompletion(env, fetch);
    completion.select(provider, true);
    expect(fetch).not.toHaveBeenCalled();
    expect(await completion.complete('const score', '\n')).toBe(' = 1;');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).not.toContain('gamedev');
    completion.select(null, false);
    await expect(completion.complete('const score', '')).rejects.toThrow('Enable');
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it('cancels in-flight requests when disabled and returns no provider error details', async () => {
  let signal: AbortSignal | undefined;
  const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
    signal = options?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) =>
      signal?.addEventListener('abort', () => reject(Error('mock-openai secret error'))),
    );
  });
  const completion = codeCompletion(env, fetch);
  completion.select('openai', true);
  const pending = completion.complete('const score', '');
  completion.select(null, false);
  expect(signal?.aborted).toBe(true);
  await expect(pending).rejects.toThrow('Provider completion unavailable');
});
