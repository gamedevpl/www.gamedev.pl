import { expect, it } from 'vitest';
import { interactiveArgs } from './agy-interactive.js';
import { loadAdapters } from './adapters.js';
it('keeps MCP and model overrides but enables native permission prompts', () => {
  const spec = loadAdapters().adapters.find((a) => a.name === 'codex')!;
  const args = interactiveArgs({
    spec: {
      ...spec,
      headless: ['-c', 'mcp_servers.gamedevpl.url="https://example.test"', ...spec.headless, '--model', 'chosen'],
    },
    cwd: '/game',
    env: {},
    prompt: 'Build it',
    abort: new AbortController().signal,
  });
  expect(args).toContain('mcp_servers.gamedevpl.url="https://example.test"');
  expect(args).toContain('chosen');
  expect(args).toContain('on-request');
  expect(args).toContain('approvals_reviewer="user"');
  expect(args).toContain('workspace-write');
  expect(args).not.toContain('exec');
  expect(args).not.toContain('--json');
  expect(args).not.toContain('--skip-git-repo-check');
  expect(args).not.toContain('never');
  expect(args.at(-1)).toBe('Build it');
});
