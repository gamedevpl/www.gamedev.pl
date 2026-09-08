import { expect, it } from 'vitest';
import { loadAdapters } from './adapters.js';
import { runLocalBuild, type Workshop } from './workshop.js';
const spec = loadAdapters().adapters.find((row) => row.name === 'codex')!;
function workshop(over: Partial<Workshop>): Workshop {
  return {
    root: '/checkout',
    slug: 'game',
    token: '',
    env: {},
    adapters: [spec],
    builder: 'self',
    abort: { current: null },
    pick: async () => {
      throw new Error('unexpected picker');
    },
    ...over,
  };
}
it('repairs editor validation in the same workspace and keeps ownership through checks', async () => {
  const prompts: string[] = [];
  const local: string[] = [];
  const ws = workshop({
    onLocalTask: (agent) => local.push(agent),
    runAdapter: async (input) => {
      expect(input.spec).toBe(spec);
      expect(input.cwd).toBe('/checkout/games/game');
      prompts.push(input.prompt);
      return { code: 0 };
    },
    run: (_cmd, args) => {
      expect(local).toEqual(['codex']);
      return args[1] === 'check:static' && prompts.length === 1
        ? { status: 1, stderr: 'EDITOR.json stale; declare editor in SPEC.md' }
        : { status: 0, stderr: '' };
    },
  });
  expect(await runLocalBuild({ ws, spec, brief: 'build the game', write: () => {} })).toBe(true);
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain('EDITOR.json stale; declare editor in SPEC.md');
  expect(prompts[1]).toContain('build the game');
  expect(local).toEqual(['codex', '']);
  expect(ws.abort.current).toBeNull();
});
it('stops the repair loop on cancellation and releases local ownership', async () => {
  let calls = 0;
  const local: string[] = [];
  const ws = workshop({
    onLocalTask: (agent) => local.push(agent),
    runAdapter: async (input) => {
      calls += 1;
      if (calls === 2) ws.abort.current?.abort();
      expect(input.abort).toBe(ws.abort.current?.signal);
      return { code: 0 };
    },
    run: () => ({ status: 1, stderr: 'bad metadata' }),
  });
  expect(await runLocalBuild({ ws, spec, brief: 'build', write: () => {} })).toBe(false);
  expect(calls).toBe(2);
  expect(local).toEqual(['codex', '']);
  expect(ws.abort.current).toBeNull();
});
