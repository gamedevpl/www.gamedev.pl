import { beforeEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { requireClaudeSubscription, subscriptionEnv } from './claude-auth.js';
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const input = { command: 'claude', cwd: '/checkout/game', env: { HOME: '/home' } };
it('removes inherited paid-provider credentials without changing the parent or OAuth login', () => {
  const parent = {
    ANTHROPIC_API_KEY: 'secret',
    ANTHROPIC_AUTH_TOKEN: 'secret',
    ANTHROPIC_BASE_URL: 'proxy',
    CLAUDE_CODE_USE_VERTEX: '1',
    CLAUDE_CODE_OAUTH_TOKEN: 'login',
    HOME: '/home',
  };
  expect(subscriptionEnv(parent)).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: 'login', HOME: '/home' });
  expect(parent.ANTHROPIC_API_KEY).toBe('secret');
});
it.each([
  { loggedIn: false },
  { loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty' },
  { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'vertex' },
])('refuses unknown or API authentication: %j', (status) => {
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify(status) } as ReturnType<typeof spawnSync>);
  expect(() => requireClaudeSubscription(input)).toThrow('no agent was started');
});
it('accepts a verified subscription in the same cwd and environment as the task', () => {
  vi.mocked(spawnSync).mockReturnValue({
    status: 0,
    stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }),
  } as ReturnType<typeof spawnSync>);
  requireClaudeSubscription(input);
  expect(spawnSync).toHaveBeenCalledWith(
    'claude',
    ['auth', 'status', '--json'],
    expect.objectContaining({ cwd: input.cwd, env: input.env }),
  );
});

it('checks the same settings overrides as the launched adapter', () => {
  vi.mocked(spawnSync).mockReturnValue({
    status: 0,
    stdout: JSON.stringify({ loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty' }),
  } as ReturnType<typeof spawnSync>);
  expect(() =>
    requireClaudeSubscription({
      ...input,
      args: ['-p', '--settings', '/custom.json', '--setting-sources=user', '--bare'],
    }),
  ).toThrow('no agent was started');
  expect(spawnSync).toHaveBeenCalledWith(
    'claude',
    ['--settings', '/custom.json', '--setting-sources=user', '--bare', 'auth', 'status', '--json'],
    expect.anything(),
  );
});
