import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { connectGame } from './connect.js';
import type { ApiClient } from './api.js';
it.each([0, 1])('gives Codex MCP a native terminal and reports exit %s', async (code) => {
  const dir = mkdtempSync(join(tmpdir(), 'connect-native-'));
  let scratch = '';
  const request = vi.fn(async (_method, path) =>
    path.includes('/api/me/studio?')
      ? { games: [{ slug: 'sky', token: 'round' }] }
      : {
          slug: 'sky',
          mcpUrl: 'https://example.test/mcp',
          authorizationHeader: 'Bearer test-round',
          kickoffPrompt: 'Build sky',
        },
  );
  const runAdapter = vi.fn(async () => ({ code: 0 }));
  const interactiveRun = vi.fn(async (input) => {
    scratch = input.cwd;
    expect(input.spec.headless.join(' ')).toContain('mcp_servers.gamedevpl');
    expect(input.prompt).toBe('Build sky');
    expect(input.cwd).not.toBe(dir);
    return { code };
  });
  try {
    const promise = connectGame({
      api: { request } as unknown as ApiClient,
      slug: 'sky',
      dest: dir,
      agent: 'codex',
      which: () => '/bin/codex',
      runAdapter,
      interactiveRun,
      write: () => {},
    });
    if (code === 0) await expect(promise).resolves.toEqual({ spawned: true, mcp: true });
    else await expect(promise).rejects.toThrow('Codex stopped');
    expect(interactiveRun).toHaveBeenCalledTimes(1);
    expect(runAdapter).not.toHaveBeenCalled();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
});
it('refuses headless Codex before fetching MCP credentials', async () => {
  const request = vi.fn(async () => ({ games: [{ slug: 'sky', token: 'round' }] }));
  await expect(
    connectGame({
      api: { request } as unknown as ApiClient,
      slug: 'sky',
      dest: '/tmp',
      agent: 'codex',
      which: () => '/bin/codex',
      write: () => {},
    }),
  ).rejects.toThrow('interactive terminal');
  expect(request.mock.calls).toHaveLength(1);
});
