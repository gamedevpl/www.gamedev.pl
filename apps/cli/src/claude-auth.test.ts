import { beforeEach, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { requireClaudeSubscription, subscriptionEnv } from './claude-auth.js';
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const input = { command: 'claude', cwd: '/checkout/game', env: { HOME: '/home' } };
function respond(status: unknown, stderr = '', error: Error | null = null) {
  vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
    queueMicrotask(() => callback(error, JSON.stringify(status), stderr));
  }) as typeof execFile);
}
it('removes provider credentials while retaining model selection and OAuth without mutating the parent', () => {
  const parent = {
    ANTHROPIC_API_KEY: 'secret',
    ANTHROPIC_AUTH_TOKEN: 'secret',
    ANTHROPIC_BASE_URL: 'proxy',
    ANTHROPIC_CUSTOM_HEADERS: 'Authorization: secret',
    CLAUDE_CODE_USE_VERTEX: '1',
    CLAUDE_CODE_OAUTH_TOKEN: 'login',
    ANTHROPIC_MODEL: 'sonnet',
    HOME: '/home',
  };
  expect(subscriptionEnv(parent)).toEqual({
    CLAUDE_CODE_OAUTH_TOKEN: 'login',
    ANTHROPIC_MODEL: 'sonnet',
    HOME: '/home',
  });
  expect(parent.ANTHROPIC_API_KEY).toBe('secret');
});
it.each([
  { loggedIn: false },
  { loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty' },
  { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'vertex' },
])('refuses unknown or API authentication: %j', async (status) => {
  respond(status);
  await expect(requireClaudeSubscription(input)).rejects.toThrow('no agent was started');
});
it.each(['claude.ai', 'oauth_token'])('accepts verified subscription authentication: %s', async (authMethod) => {
  respond({ loggedIn: true, authMethod, apiProvider: 'firstParty' });
  await requireClaudeSubscription(input);
  expect(execFile).toHaveBeenCalledWith(
    'claude',
    ['auth', 'status', '--json'],
    expect.objectContaining({ cwd: input.cwd, env: input.env }),
    expect.any(Function),
  );
});
it('checks settings overrides and reports obsolete CLI versions separately', async () => {
  respond(null, 'unknown command: auth', new Error('exit 1'));
  await expect(
    requireClaudeSubscription({
      ...input,
      args: ['-p', '--settings', '/custom.json', '--setting-sources=user', '--bare'],
    }),
  ).rejects.toThrow('version cannot report');
  expect(execFile).toHaveBeenCalledWith(
    'claude',
    ['--settings', '/custom.json', '--setting-sources=user', '--bare', 'auth', 'status', '--json'],
    expect.anything(),
    expect.any(Function),
  );
});
it('passes cancellation through to the child and rejects cancellation', async () => {
  const controller = new AbortController();
  respond({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' });
  const pending = requireClaudeSubscription({ ...input, abort: controller.signal });
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  expect(execFile).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({ signal: controller.signal }),
    expect.anything(),
  );
});
