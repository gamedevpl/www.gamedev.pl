import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { managePlugins } from './plugins.js';
import { pluginLayout, type PluginRunner } from './plugin-adapters.js';
import { PLUGIN_NAME, PLUGIN_TARGETS, type PluginTarget } from './plugin-packages.js';
import { connectGame } from './connect.js';
import type { ApiClient } from './api.js';

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function fixture(target: PluginTarget) {
  const home = mkdtempSync(join(tmpdir(), 'gdpl-plugin-'));
  homes.push(home);
  const env = { HOME: home, XDG_CONFIG_HOME: join(home, '.config') };
  const layout = pluginLayout(target, env);
  const calls: string[][] = [];
  const run: PluginRunner = (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('--help')) return 'install uninstall add remove';
    if (args.includes('list')) return '[]';
    if (args.includes('marketplace')) return 'ok';
    const installed = join(layout.roots[0]!, PLUGIN_NAME);
    const install = args.includes('install') || args.includes('add');
    if (install) cpSync(join(layout.state, 'source/plugin'), installed, { recursive: true });
    else rmSync(installed, { recursive: true, force: true });
    return 'ok';
  };
  const invoke = (action: string, flags: Record<string, boolean> = {}, runner = run) =>
    managePlugins({ args: [action, target], flags, env, cwd: home, run: runner });
  return { home, env, layout, run, invoke, calls };
}

describe('plugin lifecycle', () => {
  it.each(['claude', 'codex', 'copilot'] as const)(
    'keeps temporary connect wiring independent of an installed %s plugin',
    async (target) => {
      const f = fixture(target);
      await f.invoke('install');
      const scratch: string[] = [];
      const launch = vi.fn(async (input) => {
        scratch.push(input.cwd);
        expect(input.spec.headless.join(' ')).toMatch(/mcp-config|mcp_servers.gamedevpl/);
        return { code: 0 };
      });
      const api = {
        request: vi.fn(async (_method: string, path: string) =>
          path.includes('/api/me/studio?')
            ? { games: [{ slug: 'sky', token: 'round' }] }
            : {
                slug: 'sky',
                mcpUrl: 'https://www.gamedev.pl/api/mcp',
                authorizationHeader: 'Bearer round-key',
                kickoffPrompt: 'Build sky',
              },
        ),
      } as unknown as ApiClient;
      try {
        expect(
          await connectGame({
            api,
            slug: 'sky',
            dest: f.home,
            agent: target,
            env: f.env,
            which: () => '/bin/agent',
            runAdapter: launch,
            interactiveRun: launch,
            write: () => {},
          }),
        ).toEqual({ spawned: true, mcp: true });
        expect(launch).toHaveBeenCalledTimes(1);
        expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'installed' }] });
        await f.invoke('uninstall');
      } finally {
        for (const path of scratch) rmSync(path, { recursive: true, force: true });
      }
    },
  );
  it.each(PLUGIN_TARGETS)('installs %s once and removes only its own integration', async (target) => {
    const f = fixture(target);
    const config = f.layout.configs[0]!;
    mkdirSync(dirname(config), { recursive: true });
    const original =
      target === 'codex'
        ? '[mcp_servers.other]\ncommand = "other"\n'
        : '{"theme":"dark","mcpServers":{"other":{"command":"other"}}}\n';
    writeFileSync(config, original);
    expect(await f.invoke('install')).toMatchObject({ status: 'installed', changed: true });
    const firstCalls = f.calls.length;
    expect(await f.invoke('install')).toMatchObject({ status: 'installed', changed: false });
    expect(f.calls).toHaveLength(firstCalls);
    expect(await f.invoke('status')).toMatchObject({ plugins: [{ target, status: 'installed' }] });
    expect(await f.invoke('uninstall')).toMatchObject({ status: 'absent', changed: true });
    expect(readFileSync(config, 'utf8')).toBe(original);
    expect(await f.invoke('uninstall')).toMatchObject({ status: 'absent', changed: false });
    expect(existsSync(join(f.layout.state, 'source'))).toBe(false);
  });

  it.each(PLUGIN_TARGETS)('preserves a pre-existing %s connection and never claims ownership', async (target) => {
    const f = fixture(target);
    const config = f.layout.configs[0]!;
    mkdirSync(dirname(config), { recursive: true });
    const original =
      target === 'codex'
        ? '[mcp_servers.gamedevpl]\nurl="https://www.gamedev.pl/api/mcp"\n'
        : '{"mcpServers":{"gamedevpl":{"url":"https://www.gamedev.pl/api/mcp"}}}\n';
    writeFileSync(config, original);
    expect(await f.invoke('install')).toMatchObject({ status: 'external', changed: false });
    expect(await f.invoke('uninstall')).toMatchObject({ status: 'external', changed: false });
    expect(readFileSync(config, 'utf8')).toBe(original);
    expect(f.calls).toHaveLength(0);
    expect(existsSync(join(f.layout.state, 'receipt.json'))).toBe(false);
  });

  it.each(PLUGIN_TARGETS)('preserves hand-edited %s plugin files on install and uninstall', async (target) => {
    const f = fixture(target);
    await f.invoke('install');
    const installed = f.layout.direct ?? join(f.layout.roots[0]!, PLUGIN_NAME);
    const edited = target === 'opencode' ? installed : join(installed, 'skills/gamedevpl/SKILL.md');
    writeFileSync(edited, 'creator customization');
    const calls = f.calls.length;
    await expect(f.invoke('install')).rejects.toThrow('changed outside');
    await expect(f.invoke('uninstall')).rejects.toThrow('changed outside');
    expect(readFileSync(edited, 'utf8')).toBe('creator customization');
    expect(f.calls).toHaveLength(calls);
  });

  it('does not execute tools or write files during a dry run', async () => {
    const f = fixture('claude');
    expect(await f.invoke('install', { 'dry-run': true })).toMatchObject({ dryRun: true, status: 'absent' });
    expect(f.calls).toHaveLength(0);
    expect(existsSync(join(f.home, '.config'))).toBe(false);
  });

  it('refuses dangling symlinks before writing a plugin', async () => {
    const f = fixture('cursor');
    mkdirSync(dirname(f.layout.direct!), { recursive: true });
    const outside = join(f.home, 'untouched');
    symlinkSync(outside, f.layout.direct!);
    await expect(f.invoke('install')).rejects.toThrow('symlink');
    expect(existsSync(outside)).toBe(false);
  });

  it('leaves an existing native plugin and its manifest untouched', async () => {
    const f = fixture('copilot');
    const path = join(f.layout.roots[0]!, 'someone-else/gamedev-pl');
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'plugin.json'), JSON.stringify({ name: 'gamedev-pl' }));
    expect(await f.invoke('install')).toMatchObject({ status: 'external', changed: false });
    expect(f.calls).toHaveLength(0);
  });

  it('cleans an incomplete native install without changing another plugin', async () => {
    const f = fixture('copilot');
    let fail = true;
    const run: PluginRunner = (...args) => {
      const result = f.run(...args);
      if (fail && args[1][0] === 'plugin' && args[1][1] === 'install') throw new Error('client failed after copy');
      return result;
    };
    await expect(f.invoke('install', {}, run)).rejects.toThrow('client failed');
    expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'pending' }] });
    fail = false;
    expect(await f.invoke('uninstall', {}, run)).toMatchObject({ status: 'absent', changed: true });
  });

  it('keeps an existing marketplace registration rather than repointing it', async () => {
    const f = fixture('claude');
    const run: PluginRunner = (_command, args) =>
      args.includes('--help') ? 'install uninstall' : '[{"name":"gamedevpl-cli-bundled"}]';
    await expect(f.invoke('install', {}, run)).rejects.toThrow('marketplace already exists');
    expect(existsSync(join(f.layout.state, 'source'))).toBe(false);
  });

  it('refuses uninstall when the owned marketplace has another plugin', async () => {
    const f = fixture('claude');
    await f.invoke('install');
    const run: PluginRunner = (...args) =>
      args[1].includes('list') ? '[{"id":"other@gamedevpl-cli-bundled"}]' : f.run(...args);
    await expect(f.invoke('uninstall', {}, run)).rejects.toThrow('other plugins');
    expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'installed' }] });
  });

  it('exposes the commands through runCli without account or network calls', async () => {
    const { runCli } = await import('./main.js');
    const { PassThrough } = await import('node:stream');
    const f = fixture('cursor');
    const output: string[] = [];
    const stdout = new PassThrough();
    stdout.on('data', (chunk) => output.push(String(chunk)));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    try {
      const code = await runCli(['node', 'gamedevpl', 'plugins', 'status', '--json'], f.env, {
        stdin: new PassThrough() as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: new PassThrough() as unknown as NodeJS.WriteStream,
      });
      expect(code).toBe(0);
      expect(JSON.parse(output.join('')).plugins).toHaveLength(7);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
