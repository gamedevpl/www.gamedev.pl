import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { refreshInstalledPlugins, formatPluginRefresh } from './update-plugins.js';

const roots: string[] = [];
function fixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-fresh-cli-'));
  roots.push(root);
  const dest = join(root, 'downloaded cli.mjs');
  writeFileSync(dest, source);
  return { root, run: () => refreshInstalledPlugins({ dest, cwd: root, env: { ...process.env, HOME: root } }) };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('runs the downloaded CLI with its own version and the same creator home and cwd', async () => {
  const f = fixture(`import fs from 'node:fs';
    fs.writeFileSync('observed.json',JSON.stringify({args:process.argv.slice(2),home:process.env.HOME,cwd:process.cwd()}));
    console.log(JSON.stringify({ok:true,plugins:[{target:'cursor',status:'installed',changed:true,installedVersion:'9.0.0'}]}));`);
  const result = await f.run();
  expect(result).toMatchObject({ ok: true, updated: true, plugins: [{ installedVersion: '9.0.0' }] });
  expect(JSON.parse(readFileSync(join(f.root, 'observed.json'), 'utf8'))).toEqual({
    args: ['plugins', 'update', '--json'],
    home: f.root,
    cwd: f.root,
  });
  expect(formatPluginRefresh(result)).toContain('cursor: updated (9.0.0)');
});

it('treats protected installations as successful skips while retaining their reasons', async () => {
  const rows = ['modified', 'pending', 'disabled'].map((skipped) => ({
    target: skipped,
    status: 'installed',
    skipped,
    changed: false,
    error: 'preserved for review',
  }));
  const f = fixture(`console.log(JSON.stringify(${JSON.stringify({ ok: false, plugins: rows })}));process.exitCode=4;`);
  const result = await f.run();
  expect(result).toMatchObject({ ok: true, updated: false, plugins: rows });
  for (const row of rows) expect(formatPluginRefresh(result)).toContain(`skipped (${row.skipped})`);
});

it.each(['pending', 'absent'])(
  'reports actual installer errors when the client is %s, preserving other results',
  async (status) => {
    const rows = [
      { target: 'cursor', status: 'installed', changed: true, installedVersion: '9.0.0' },
      { target: 'gemini', status, error: 'native installer failed' },
    ];
    const f = fixture(
      `console.log(JSON.stringify(${JSON.stringify({ ok: false, plugins: rows })}));process.exitCode=4;`,
    );
    const result = await f.run();
    expect(result).toMatchObject({ ok: false, updated: true, plugins: rows });
    expect(formatPluginRefresh(result)).toContain('gemini: update failed — native installer failed');
  },
);

it('shows the removed client and reinstall error when no other plugin is installed', async () => {
  const row = { target: 'copilot', status: 'absent', error: 'reinstall preflight failed' };
  const f = fixture(
    `console.log(JSON.stringify(${JSON.stringify({ ok: false, plugins: [row] })}));process.exitCode=4;`,
  );
  const result = await f.run();
  expect(result.ok).toBe(false);
  expect(formatPluginRefresh(result)).toContain('copilot: update failed — reinstall preflight failed');
  expect(formatPluginRefresh(result)).not.toContain('No coding-agent plugins need updating');
});

it.each([
  'console.log("bad report");',
  'console.log(JSON.stringify({ok:true,plugins:[null]}));',
  'console.log(JSON.stringify({ok:false,plugins:[]}));process.exitCode=4;',
  'console.log(JSON.stringify({ok:true,plugins:[]}));process.exitCode=1;',
])('reports a failed or invalid child without claiming plugin success: %s', async (source) => {
  const result = await fixture(source).run();
  expect(result).toMatchObject({ ok: false, updated: false, error: expect.stringContaining('CLI installed') });
});

it('keeps an empty inventory successful without printing absent clients', async () => {
  const f = fixture(
    'console.log(JSON.stringify({ok:true,plugins:[{target:"cursor",status:"absent",skipped:"absent",changed:false}]}));',
  );
  expect(formatPluginRefresh(await f.run())).toBe('No coding-agent plugins need updating.');
});
