import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { configurePlugin, updatePlugins } from './plugin-update.js';
import { managePlugins, pluginStatus } from './plugins.js';
import { pluginLayout } from './plugin-adapters.js';
import { CLI_VERSION } from './update.js';

const homes: string[] = [];
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'gdpl-plugin-update-'));
  homes.push(home);
  const env = { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), GAMEDEV_CREATOR_KEY: 'fixture-private-key' };
  const input = { env, flags: {}, cwd: home };
  const layout = pluginLayout('vibe', env);
  return {
    ...input,
    layout,
    install: () => managePlugins({ ...input, args: ['install', 'vibe'] }),
    update: (flags = {}) => updatePlugins({ ...input, flags, args: ['vibe'] }),
    configure: () => configurePlugin({ ...input, args: ['vibe'] }),
    receipt: join(layout.state, 'receipt.json'),
  };
}
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

it('updates an older owned package while preserving the Vibe key and user configuration', async () => {
  const f = fixture();
  const config = f.layout.configs[0]!;
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, 'active_model="mine"\n');
  await f.install();
  await f.configure();
  const receipt = JSON.parse(readFileSync(f.receipt, 'utf8'));
  receipt.packageVersion = '0.0.1';
  writeFileSync(f.receipt, JSON.stringify(receipt));
  expect(pluginStatus('vibe', f.env)).toMatchObject({ installedVersion: '0.0.1', updateAvailable: true });
  expect(await f.update()).toMatchObject({
    ok: true,
    plugins: [{ status: 'installed', installedVersion: CLI_VERSION, changed: true, updateAvailable: false }],
  });
  expect(readFileSync(config, 'utf8')).toBe('active_model="mine"\n');
  expect(readFileSync(join(f.layout.state, 'creator-key'), 'utf8')).toBe(f.env.GAMEDEV_CREATOR_KEY);
  await managePlugins({ ...f, args: ['uninstall', 'vibe'] });
  expect(existsSync(join(f.layout.state, 'creator-key'))).toBe(true);
});

it('skips current and external packages and does not install absent clients', async () => {
  const f = fixture();
  await f.install();
  const before = readFileSync(f.receipt, 'utf8');
  expect(await f.update()).toMatchObject({ ok: true, plugins: [{ changed: false }] });
  expect(readFileSync(f.receipt, 'utf8')).toBe(before);
  const other = fixture();
  mkdirSync(other.layout.direct!, { recursive: true });
  writeFileSync(join(other.layout.direct!, 'notes'), 'foreign');
  expect(await other.update()).toMatchObject({ ok: true, plugins: [{ status: 'external', changed: false }] });
  expect(readFileSync(join(other.layout.direct!, 'notes'), 'utf8')).toBe('foreign');
  const empty = fixture();
  expect(await updatePlugins({ ...empty, args: [] })).toMatchObject({ ok: true });
  expect(existsSync(join(empty.env.XDG_CONFIG_HOME, 'gamedevpl'))).toBe(false);
});

it('reports customized files without deleting them or exposing the configured key', async () => {
  const f = fixture();
  await f.install();
  const skill = join(f.layout.direct!, 'skills/gamedevpl/SKILL.md');
  writeFileSync(skill, 'creator customization');
  const result = await f.update();
  expect(result.ok).toBe(false);
  expect(result.plugins[0]).toMatchObject({ skipped: 'modified', changed: false });
  expect(readFileSync(skill, 'utf8')).toBe('creator customization');
  expect(JSON.stringify(result)).not.toContain(f.env.GAMEDEV_CREATOR_KEY);
  await expect(f.configure()).rejects.toThrow('unchanged');
});

it('previews an available update without changing receipts, plugins, or credentials', async () => {
  const f = fixture();
  await f.install();
  const receipt = JSON.parse(readFileSync(f.receipt, 'utf8'));
  receipt.packageVersion = '0.0.1';
  writeFileSync(f.receipt, JSON.stringify(receipt));
  const before = readFileSync(f.receipt, 'utf8');
  expect(await f.update({ 'dry-run': true })).toMatchObject({
    ok: true,
    plugins: [{ changed: false, updateAvailable: true }],
  });
  expect(readFileSync(f.receipt, 'utf8')).toBe(before);
  expect(existsSync(join(f.layout.state, 'creator-key'))).toBe(false);
});

it('reads older receipts and preserves the private key across explicit reconfiguration', async () => {
  const f = fixture();
  await f.install();
  const receipt = JSON.parse(readFileSync(f.receipt, 'utf8'));
  delete receipt.packageVersion;
  writeFileSync(f.receipt, JSON.stringify(receipt));
  expect(pluginStatus('vibe', f.env)).toMatchObject({ installedVersion: CLI_VERSION, updateAvailable: false });
  expect(await f.configure()).toMatchObject({ changed: true });
  expect(await f.configure()).toMatchObject({ changed: false });
  if (process.platform !== 'win32') expect(lstatSync(join(f.layout.state, 'creator-key')).mode & 0o077).toBe(0);
  const result = await configurePlugin({
    ...f,
    env: { ...f.env, GAMEDEV_CREATOR_KEY: 'rotated-private-key' },
    args: ['vibe'],
  });
  expect(result).toMatchObject({ changed: true });
  expect(JSON.stringify(result)).not.toContain('rotated-private-key');
});

it('preserves a disabled native registration instead of reinstalling and enabling it', async () => {
  const f = fixture();
  const layout = pluginLayout('copilot', f.env);
  let disabled = false;
  let removals = 0;
  const run = (_command: string, args: string[]) => {
    if (args.includes('--help')) return 'install uninstall';
    if (args.includes('list')) return JSON.stringify([{ name: 'gamedevpl-cli', enabled: !disabled }]);
    if (args.includes('install'))
      cpSync(join(layout.state, 'source/plugin'), join(layout.roots[0]!, 'gamedevpl-cli'), { recursive: true });
    else removals++;
    return '';
  };
  await managePlugins({ ...f, args: ['install', 'copilot'], run });
  const path = join(layout.state, 'receipt.json');
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  receipt.packageVersion = '0.0.1';
  writeFileSync(path, JSON.stringify(receipt));
  disabled = true;
  expect(await updatePlugins({ ...f, args: ['copilot'], run })).toMatchObject({
    ok: false,
    plugins: [{ status: 'installed', skipped: 'disabled', changed: false, error: expect.stringContaining('disabled') }],
  });
  expect(removals).toBe(0);
  expect(JSON.parse(readFileSync(path, 'utf8')).packageVersion).toBe('0.0.1');
});

it('preserves cached files after the creator removes the plugin in the native client', async () => {
  const f = fixture();
  const layout = pluginLayout('copilot', f.env);
  let registered = true;
  let removals = 0;
  const run = (_command: string, args: string[]) => {
    if (args.includes('--help')) return 'install uninstall';
    if (args.includes('list')) return JSON.stringify(registered ? [{ name: 'gamedevpl-cli' }] : []);
    if (args.includes('install'))
      cpSync(join(layout.state, 'source/plugin'), join(layout.roots[0]!, 'gamedevpl-cli'), { recursive: true });
    else removals++;
    return '';
  };
  await managePlugins({ ...f, args: ['install', 'copilot'], run });
  const path = join(layout.state, 'receipt.json');
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  receipt.packageVersion = '0.0.1';
  writeFileSync(path, JSON.stringify(receipt));
  const before = readFileSync(path, 'utf8');
  registered = false;
  expect(await updatePlugins({ ...f, args: ['copilot'], run })).toMatchObject({
    ok: false,
    plugins: [{ skipped: 'removed', changed: false }],
  });
  expect(removals).toBe(0);
  expect(readFileSync(path, 'utf8')).toBe(before);
});
