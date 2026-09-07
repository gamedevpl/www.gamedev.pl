import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './main.js';
import { runInkRepl } from './tui/host.js';

vi.mock('./tui/host.js', () => ({ runInkRepl: vi.fn(async () => 0) }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function streams(tty = true) {
  const stdin = Object.assign(new PassThrough(), { isTTY: tty });
  const stdout = Object.assign(new PassThrough(), { isTTY: tty });
  const stderr = new PassThrough();
  let output = '';
  stdout.on('data', (value) => {
    output += String(value);
  });
  return {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    output: () => output,
  };
}
function backend() {
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes('/connect')
            ? { mcpUrl: 'https://example.test/mcp', kickoffPrompt: 'Build sky' }
            : { games: [{ slug: 'sky', token: 'tok' }] },
        ),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const env = { GAMEDEV_TOKEN: 'test-token' };
describe('connect entry points', () => {
  it('opens the interactive choices instead of fetching manual MCP credentials', async () => {
    const fetch = backend();
    expect(await runCli(['node', 'cli', 'connect', 'sky'], env, streams())).toBe(0);
    expect(runInkRepl).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok', slug: 'sky', initialLine: '/connect sky' }),
    );
    expect(fetch.mock.calls.every(([url]) => !url.endsWith('/connect'))).toBe(true);
  });
  it('can open an existing game directly in the interactive mode', async () => {
    backend();
    expect(await runCli(['node', 'cli', 'repl', 'sky'], env, streams())).toBe(0);
    expect(runInkRepl).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok', slug: 'sky' }));
  });
  it.each([true, false])('keeps explicit manual setup noninteractive (tty=%s)', async (tty) => {
    backend();
    const io = streams(tty);
    expect(await runCli(['node', 'cli', 'connect', 'sky', '--manual'], env, io)).toBe(0);
    expect(runInkRepl).not.toHaveBeenCalled();
    expect(io.output()).toContain('gamedevpl repl sky');
    expect(io.output()).toContain('gamedevpl checkout sky');
    expect(io.output()).toContain('No agent has been started');
  });
});
