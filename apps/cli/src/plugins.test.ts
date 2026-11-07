import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { managePlugins } from './plugins.js';
import { pluginLayout, runPluginTool, type PluginRunner } from './plugin-adapters.js';
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
  let registered = false;
  const run: PluginRunner = (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('--help')) return 'install uninstall add remove';
    if (args.includes('list')) {
      if (args.includes('marketplace')) return '[]';
      return registered
        ? JSON.stringify([{ id: `${PLUGIN_NAME}@gamedevpl-cli-bundled`, name: PLUGIN_NAME, scope: 'user' }])
        : '[]';
    }
    if (args.includes('marketplace')) return 'ok';
    const installed = join(layout.roots[0]!, PLUGIN_NAME);
    const install = args.includes('install') || args.includes('add');
    if (install) {
      cpSync(join(layout.state, 'source/plugin'), installed, { recursive: true });
      registered = true;
    } else {
      rmSync(installed, { recursive: true, force: true });
      registered = false;
    }
    return 'ok';
  };
  const invoke = (action: string, flags: Record<string, boolean> = {}, runner = run) =>
    managePlugins({ args: [action, target], flags, env, cwd: home, run: runner });
  return {
    home,
    env,
    layout,
    run,
    invoke,
    calls,
    forgetNative: () => {
      registered = false;
    },
  };
}

describe('plugin lifecycle', () => {
  it('does not expose the CLI creator session to native plugin managers', () => {
    const f = fixture('cursor');
    const result = runPluginTool(
      process.execPath,
      [
        '-e',
        'process.stdout.write(JSON.stringify({token:process.env.GAMEDEV_TOKEN,file:process.env.GAMEDEV_TOKEN_FILE,marker:process.env.PLUGIN_TEST_MARKER}))',
      ],
      {
        ...process.env,
        GAMEDEV_TOKEN: 'fixture-creator-token',
        GAMEDEV_TOKEN_FILE: 'fixture-private-file',
        PLUGIN_TEST_MARKER: 'kept',
      },
      f.home,
    );
    expect(JSON.parse(result)).toEqual({ marker: 'kept' });
  });
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

  it.each([
    ['copilot', false],
    ['copilot', true],
    ['gemini', false],
    ['gemini', true],
  ] as const)('recovers a killed %s installer while preserving customizations: %s', async (target, customized) => {
    const f = fixture(target);
    const script = join(f.home, 'killed.mts');
    const sourceModule = new URL('./plugins.ts', import.meta.url).href;
    writeFileSync(
      script,
      `
      import {cpSync,writeFileSync} from 'node:fs';
      import {managePlugins} from ${JSON.stringify(sourceModule)};
      await managePlugins({args:['install',${JSON.stringify(target)}],flags:{},env:${JSON.stringify(f.env)},cwd:${JSON.stringify(f.home)},run:(_command,args)=>{
        if(args.includes('--help'))return 'install uninstall';
        if(args.includes('list'))return '[]';
        cpSync(${JSON.stringify(join(f.layout.state, 'source/plugin'))},${JSON.stringify(join(f.layout.roots[0]!, PLUGIN_NAME))},{recursive:true});
        ${target === 'gemini' ? `writeFileSync(${JSON.stringify(join(f.layout.roots[0]!, PLUGIN_NAME, '.gemini-extension-install.json'))}, ${JSON.stringify(JSON.stringify({ source: join(f.layout.state, 'source/plugin'), type: 'local' }))});` : ''}
        process.kill(process.pid,'SIGKILL');
        return '';
      }});
    `,
    );
    const require = createRequire(import.meta.url);
    const killed = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, script], {
      cwd: f.home,
      env: { ...process.env, HOME: f.home },
      timeout: 15_000,
      encoding: 'utf8',
    });
    expect(killed.signal, killed.stderr).toBe('SIGKILL');
    const receipt = JSON.parse(readFileSync(join(f.layout.state, 'receipt.json'), 'utf8'));
    expect(receipt.phase).toBe('pending');
    expect(receipt.trees).toEqual({});
    const plugin = join(f.layout.roots[0]!, PLUGIN_NAME);
    if (customized) {
      writeFileSync(join(plugin, 'notes.txt'), 'creator notes');
      expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'modified' }] });
      await expect(f.invoke('uninstall')).rejects.toThrow('changed outside');
      expect(readFileSync(join(plugin, 'notes.txt'), 'utf8')).toBe('creator notes');
    } else {
      expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'pending' }] });
      await f.invoke('uninstall');
      expect(existsSync(plugin)).toBe(false);
      expect(existsSync(join(f.layout.state, 'source'))).toBe(false);
    }
  });

  it('cleans owned sources after the native client already removed its plugin', async () => {
    const f = fixture('copilot');
    await f.invoke('install');
    rmSync(join(f.layout.roots[0]!, PLUGIN_NAME), { recursive: true });
    expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'pending' }] });
    expect(await f.invoke('uninstall')).toMatchObject({ status: 'absent', changed: true });
    expect(existsSync(join(f.layout.state, 'source'))).toBe(false);
  });

  it.each(['all', 'one'] as const)('recovers native uninstall failure after deleting %s files', async (deleted) => {
    const f = fixture('copilot');
    await f.invoke('install');
    const root = join(f.layout.roots[0]!, PLUGIN_NAME);
    let fail = true;
    const run: PluginRunner = (...args) => {
      if (fail && args[1][0] === 'plugin' && args[1][1] === 'uninstall') {
        rmSync(deleted === 'all' ? root : join(root, 'skills/gamedevpl/SKILL.md'), { recursive: true });
        throw new Error('native removal interrupted');
      }
      return f.run(...args);
    };
    await expect(f.invoke('uninstall', {}, run)).rejects.toThrow('native removal interrupted');
    expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'pending' }] });
    fail = false;
    expect(await f.invoke('uninstall', {}, run)).toMatchObject({ status: 'absent', changed: true });
  });

  it('preserves a customized survivor of an interrupted uninstall', async () => {
    const f = fixture('copilot');
    await f.invoke('install');
    const root = join(f.layout.roots[0]!, PLUGIN_NAME);
    const run: PluginRunner = (...args) => {
      if (args[1][1] === 'uninstall') {
        rmSync(join(root, 'skills/gamedevpl/SKILL.md'));
        throw new Error('interrupted');
      }
      return f.run(...args);
    };
    await expect(f.invoke('uninstall', {}, run)).rejects.toThrow('interrupted');
    writeFileSync(join(root, 'README.md'), 'creator notes');
    await expect(f.invoke('uninstall')).rejects.toThrow('changed outside');
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('creator notes');
  });

  it('cleans unchanged owned cache remnants after the native registration is gone', async () => {
    const f = fixture('copilot');
    await f.invoke('install');
    f.forgetNative();
    expect(await f.invoke('uninstall')).toMatchObject({ status: 'absent', changed: true });
    expect(existsSync(join(f.layout.roots[0]!, PLUGIN_NAME))).toBe(false);
  });

  it('cleans Claude orphaned cache metadata without touching unrelated caches', async () => {
    const f = fixture('claude');
    await f.invoke('install');
    const root = join(f.layout.roots[0]!, PLUGIN_NAME);
    const other = join(f.layout.roots[0]!, 'other-plugin');
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, 'notes.txt'), 'keep');
    const run: PluginRunner = (...args) => {
      if (args[1][0] === 'plugin' && args[1][1] === 'uninstall') {
        f.forgetNative();
        writeFileSync(join(root, '.orphaned_at'), String(Date.now()));
        return 'ok';
      }
      return f.run(...args);
    };
    expect(await f.invoke('uninstall', {}, run)).toMatchObject({ status: 'absent' });
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(join(other, 'notes.txt'), 'utf8')).toBe('keep');
  });

  it('preserves a plugin installation shared with a project scope', async () => {
    const f = fixture('claude');
    await f.invoke('install');
    const run: PluginRunner = (...args) =>
      args[1].includes('list')
        ? JSON.stringify([{ id: 'gamedevpl-cli@gamedevpl-cli-bundled', scope: 'project' }])
        : f.run(...args);
    await expect(f.invoke('uninstall', {}, run)).rejects.toThrow('another scope');
    expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'installed' }] });
  });

  it.each(['claude', 'codex'] as const)('preserves a repointed %s marketplace during uninstall', async (target) => {
    const f = fixture(target);
    await f.invoke('install');
    const run: PluginRunner = (...args) => {
      if (args[1].includes('marketplace') && args[1].includes('list'))
        return JSON.stringify([{ name: 'gamedevpl-cli-bundled', path: '/someone/else', root: '/someone/else' }]);
      return f.run(...args);
    };
    await expect(f.invoke('uninstall', {}, run)).rejects.toThrow('no longer points');
    expect(await f.invoke('status')).toMatchObject({ plugins: [{ status: 'installed' }] });
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
