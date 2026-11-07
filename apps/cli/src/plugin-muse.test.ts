import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { installMuseMcp, museMcpState, planMuseMcp, uninstallMuseMcp } from './plugin-muse.js';
import { pluginLayout, runPluginTool } from './plugin-adapters.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-muse-'));
  roots.push(root);
  return { root, file: join(root, 'settings.json'), source: join(root, 'source') };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('stores an environment reference and removes only its own newly created settings', () => {
  const f = fixture();
  vi.stubEnv('GAMEDEV_CREATOR_KEY', 'fixture-secret-never-persisted');
  const plan = planMuseMcp(f.file, f.source);
  installMuseMcp(f.file, plan);
  const text = readFileSync(f.file, 'utf8');
  expect(text).toContain('${GAMEDEV_CREATOR_KEY:-}');
  expect(text).not.toContain('fixture-secret-never-persisted');
  expect(museMcpState(f.file, plan)).toBe('owned');
  uninstallMuseMcp(f.file, plan);
  expect(existsSync(f.file)).toBe(false);
});

it.each(['mcpServers', 'mcp_servers'])('preserves unrelated settings and servers under %s', (key) => {
  const f = fixture();
  const original = {
    schema_version: 1,
    theme: 'dark',
    hooks: { custom: 'keep' },
    [key]: { other: { command: 'other', required: true, startup_timeout_sec: 45 } },
  };
  writeFileSync(f.file, JSON.stringify(original));
  const plan = planMuseMcp(f.file, f.source);
  installMuseMcp(f.file, plan);
  const current = JSON.parse(readFileSync(f.file, 'utf8'));
  expect(current[key].other).toEqual(original[key]!.other);
  current.otherPreference = 'added-after-install';
  writeFileSync(f.file, JSON.stringify(current));
  uninstallMuseMcp(f.file, plan);
  expect(JSON.parse(readFileSync(f.file, 'utf8'))).toEqual({ ...original, otherPreference: 'added-after-install' });
});

it('accepts property reordering but preserves customized MCP fields', () => {
  const f = fixture();
  const plan = planMuseMcp(f.file, f.source);
  installMuseMcp(f.file, plan);
  const current = JSON.parse(readFileSync(f.file, 'utf8'));
  current.mcpServers.gamedevpl_cli = Object.fromEntries(Object.entries(structuredClone(plan.server)).reverse());
  writeFileSync(f.file, JSON.stringify(current));
  expect(museMcpState(f.file, plan)).toBe('owned');
  current.mcpServers.gamedevpl_cli.args.push('--custom');
  writeFileSync(f.file, JSON.stringify(current));
  expect(museMcpState(f.file, plan)).toBe('modified');
  expect(() => uninstallMuseMcp(f.file, plan)).toThrow('customized');
  expect(readFileSync(f.file, 'utf8')).toContain('--custom');
});

it('refuses an existing connection and a connection added after planning', () => {
  const f = fixture();
  const plan = planMuseMcp(f.file, f.source);
  const original = JSON.stringify({ schema_version: 1, mcpServers: { gamedevpl_cli: { command: 'mine' } } });
  writeFileSync(f.file, original);
  expect(() => planMuseMcp(f.file, f.source)).toThrow('already has');
  expect(() => installMuseMcp(f.file, plan)).toThrow('changed during');
  expect(readFileSync(f.file, 'utf8')).toBe(original);
});

it.each([
  'broken',
  '{}',
  '{"schema_version":1,"mcpServers":[]}',
  '{"schema_version":1,"mcpServers":{},"mcp_servers":{}}',
])('refuses unsupported settings without rewriting: %s', (text) => {
  const f = fixture();
  writeFileSync(f.file, text);
  expect(() => planMuseMcp(f.file, f.source)).toThrow();
  expect(readFileSync(f.file, 'utf8')).toBe(text);
});

it('refuses a settings symlink', () => {
  const f = fixture();
  symlinkSync(join(f.root, 'outside.json'), f.file);
  expect(() => planMuseMcp(f.file, f.source)).toThrow('symlink');
});

it('isolates native Muse settings rewrites from the creator configuration', () => {
  const f = fixture();
  const env = {
    ...process.env,
    HOME: f.root,
    XDG_CONFIG_HOME: join(f.root, '.config'),
    PATH: `${f.root}:${process.env.PATH}`,
  };
  const layout = pluginLayout('muse', env);
  mkdirSync(join(env.XDG_CONFIG_HOME, 'muse'), { recursive: true });
  const original = '{"schema_version":1,"mcpServers":{"other":{"command":"other","required":true}}}';
  writeFileSync(layout.configs[0]!, original);
  writeFileSync(
    join(f.root, 'muse'),
    `#!${process.execPath}\nconst fs = require('node:fs');\nconst dir=process.env.XDG_CONFIG_HOME+'/muse';\nfs.mkdirSync(dir,{recursive:true});\nfs.writeFileSync(dir+'/settings.json','{}');\n`,
    { mode: 0o700 },
  );
  runPluginTool('muse', ['plugins', 'remove', 'gamedevpl-cli'], env, f.root);
  expect(readFileSync(layout.configs[0]!, 'utf8')).toBe(original);
  expect(existsSync(join(layout.state, 'native-config/muse/settings.json'))).toBe(true);
});
