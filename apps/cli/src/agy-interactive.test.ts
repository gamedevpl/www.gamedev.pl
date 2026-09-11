import { expect, it, vi } from 'vitest';
import { agyConversation, interactiveArgs } from './agy-interactive.js';
import { loadAdapters } from './adapters.js';
import { runLocalBuild, type Workshop } from './workshop.js';
const spec = loadAdapters().adapters.find((a) => a.name === 'agy')!;
const id = '12345678-1234-1234-1234-123456789abc';
it('resumes the specific conversation with sandbox and without permission bypass or print mode', () => {
  expect(agyConversation(JSON.stringify({ event: 'init', conversation_id: id }))).toBe(id);
  expect(agyConversation('{')).toBeUndefined();
  const args = interactiveArgs({
    spec,
    cwd: '/game',
    env: {},
    prompt: 'edit game',
    conversation: id,
    abort: new AbortController().signal,
  });
  expect(args).toContain('--sandbox');
  expect(args).toContain('--prompt-interactive');
  expect(args).toContain(id);
  expect(args).not.toContain('--print');
  expect(args).not.toContain('stream-json');
  expect(args).not.toContain('--dangerously-skip-permissions');
});
for (const outcome of ['success', 'decline', 'failure', 'unattended'] as const) {
  it(`handles interactive permission fallback: ${outcome}`, async () => {
    const verify = vi.fn(() => ({ status: 0 }));
    const interactiveRun = vi.fn(async (input) => {
      expect(input.conversation).toBe(id);
      expect(input.cwd).toBe('/checkout/games/game');
      expect(input.prompt).toContain('make game');
      return { code: outcome === 'failure' ? 1 : 0 };
    });
    const ws: Workshop = {
      slug: 'game',
      root: '/checkout',
      token: '',
      env: {},
      adapters: [spec],
      builder: 'self',
      abort: { current: null },
      pick: async () => (outcome === 'decline' ? 'Keep edits and return' : 'Open Antigravity interactively'),
      interactiveRun,
      run: verify,
      ...(outcome === 'unattended' ? { unattended: { deliver: false } } : {}),
      runAdapter: async ({ onLine }) => {
        onLine?.(JSON.stringify({ event: 'init', conversation_id: id }));
        onLine?.('no output produced: headless mode cannot prompt, auto-denied');
        return { code: 1 };
      },
    };
    expect(await runLocalBuild({ ws, spec, brief: 'make game', write: () => {} })).toBe(outcome === 'success');
    expect(interactiveRun).toHaveBeenCalledTimes(outcome === 'success' || outcome === 'failure' ? 1 : 0);
    expect(verify.mock.calls.length > 0).toBe(outcome === 'success');
  });
}
