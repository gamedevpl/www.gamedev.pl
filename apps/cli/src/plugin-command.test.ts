import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { runPluginsCommand } from './plugin-command.js';
import { formatPluginRefresh } from './update-plugins.js';
import { formatPluginRow } from './plugin-output.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'gdpl-plugin-output-'));
  roots.push(home);
  const env = { HOME: home, XDG_CONFIG_HOME: join(home, '.config') };
  return {
    home,
    async command(args: string[], flags: Record<string, boolean> = {}) {
      let output = '';
      const code = await runPluginsCommand(args, flags, env, { write: (text) => (output += text) });
      return { output, code };
    },
  };
}

it('distinguishes MCP configuration from a plugin and preserves it on install/uninstall', async () => {
  const f = fixture();
  mkdirSync(join(f.home, '.cursor'));
  const path = join(f.home, '.cursor/mcp.json');
  const source = '{"mcpServers":{"gamedevpl":{"url":"https://www.gamedev.pl/api/mcp","secret":"do-not-print"}}}';
  writeFileSync(path, source);
  for (const action of ['status', 'install', 'uninstall']) {
    const { output, code } = await f.command([action, 'cursor']);
    expect(code).toBe(0);
    expect(output).toContain('MCP configuration detected; plugin installation is not confirmed');
    expect(output).toContain(path);
    expect(output).toContain('If it works, no additional installation is needed');
    expect(output).not.toContain('do-not-print');
    if (action !== 'status') expect(output).toContain(`Nothing ${action === 'install' ? 'installed' : 'uninstalled'}`);
    expect(readFileSync(path, 'utf8')).toBe(source);
  }
  const report = JSON.parse((await f.command(['status', 'cursor'], { json: true })).output);
  expect(report.plugins[0]).toMatchObject({ status: 'external', detectedIntegrations: [{ kind: 'mcp', path }] });
  const updateOutput = formatPluginRefresh({ ...report, ok: true, updated: false });
  expect(updateOutput).toContain('Nothing updated');
  expect(updateOutput).not.toContain('up to date');
});

it('reports actual installation, repeat installation, dry run and removal distinctly', async () => {
  const f = fixture();
  expect((await f.command(['status', 'cursor'])).output).toContain(
    'Optional — only if you use this client: gamedevpl plugins install cursor',
  );
  expect((await f.command(['install', 'cursor'])).output).toContain('cursor: plugin installed');
  expect((await f.command(['install', 'cursor'])).output).toContain('plugin already installed');
  expect((await f.command(['update', 'cursor'], { 'dry-run': true })).output).toContain('Dry run — no changes made');
  expect((await f.command(['uninstall', 'cursor'])).output).toContain('plugin uninstalled');
  expect((await f.command(['uninstall', 'cursor'])).output).toContain('nothing to uninstall');
});

it('reports external plugin evidence without claiming its connection works', async () => {
  const f = fixture();
  const path = join(f.home, '.cursor/plugins/local/gamedevpl-cli');
  mkdirSync(path, { recursive: true });
  const { output } = await f.command(['status', 'cursor']);
  expect(output).toContain('existing plugin files or registration detected');
  expect(output).toContain(path);
  expect(output).toContain('connection and authentication have not been tested');
});

it('explains that a missing client installed nothing and gives a usable command', async () => {
  const f = fixture();
  await expect(f.command(['install'])).rejects.toThrow('No plugins were installed.');
  await expect(f.command(['install'])).rejects.toThrow('gamedevpl plugins install codex');
  expect((await f.command(['status', 'cursor'])).output).toContain('no plugin or MCP configuration detected');
});

it('never presents an available update as already current, including dry runs', () => {
  const row = {
    target: 'codex',
    status: 'installed',
    installedVersion: '1.0.0',
    availableVersion: '2.0.0',
    updateAvailable: true,
    dryRun: true,
  };
  expect(formatPluginRow(row, 'update')).toContain('Update available (2.0.0): gamedevpl plugins update codex');
  expect(formatPluginRow(row, 'update')).not.toContain('no package update needed');
  expect(formatPluginRow(row, 'update')).not.toContain('plugin updated');
});
