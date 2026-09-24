import { runLocalBuild, type Workshop } from './workshop.js';
import { loadAdapters } from './adapters.js';
import { expect, it } from 'vitest';
import { trackAgentFailure } from './agent-failure.js';

it.each([
  { type: 'stderr', text: 'Selected model is at capacity. Please try a different model.' },
  { type: 'error', message: 'Selected model is at capacity. Please try a different model.' },
  { type: 'raw', line: 'Selected model is at capacity.' },
] as const)('explains capacity errors from text and structured events', (event) => {
  const failure = trackAgentFailure('codex');
  failure.observe(event);
  failure.observe({ type: 'message', text: 'Working on it' });
  expect(failure.error(1, '/connect sky --agent codex')).toMatchObject({
    message: expect.stringContaining('selected model is at capacity'),
    next: expect.stringContaining('/connect sky --agent codex'),
  });
});

it('does not infer capacity from arbitrary failures or another run', () => {
  const failure = trackAgentFailure('codex');
  failure.observe({ type: 'error', message: 'Something went wrong' });
  expect(failure.error(null, 'retry')).toMatchObject({
    message: 'codex stopped (exit unknown). Task completion is not confirmed.',
    next: 'retry',
  });
});

it('explains local model capacity without verifying or offering delivery', async () => {
  const output: string[] = [];
  let checked = false;
  const codex = loadAdapters().adapters.find((spec) => spec.name === 'codex')!;
  const ws: Workshop = {
    root: '/tmp',
    slug: 'sky',
    token: 'tok',
    env: {},
    adapters: [codex],
    builder: 'self',
    pick: async () => '/quit',
    abort: { current: null },
    runAdapter: async ({ onEvent }) => {
      onEvent?.({ type: 'stderr', text: 'Selected model is at capacity. Please try a different model.' });
      return { code: 1 };
    },
    run: () => {
      checked = true;
      return { status: 0, stdout: '', stderr: '' };
    },
  };
  expect(await runLocalBuild({ ws, spec: codex, brief: 'Fix scrolling', write: (line) => output.push(line) })).toBe(
    false,
  );
  expect(checked).toBe(false);
  expect(output.join('\n')).toContain('selected model is at capacity');
  expect(output.join('\n')).toContain('/diff');
  expect(output.join('\n')).not.toContain('static ladder green');
});
