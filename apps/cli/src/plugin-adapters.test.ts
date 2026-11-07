import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { nativePluginListing, runPluginTool } from './plugin-adapters.js';

const enabled =
  '\u001b[32m✓\u001b[39m gamedevpl-cli (1.0.0)\n Path: /owned/package\n Enabled (User): true\n Enabled (Workspace): true\n';
const unrelated =
  '✗ unrelated (1.0.0)\n Path: /unrelated/package\n Enabled (User): false\n Enabled (Workspace): false\n';
const listing = (text: string) =>
  nativePluginListing('gemini', { HOME: '/unused/gdpl-scope-test' }, '/unused', () => text);

it.each([enabled + '\n' + unrelated, unrelated + '\n' + enabled])(
  'updates an enabled Gemini extension independently of another disabled extension: %s',
  (text) => {
    expect(listing(text)).toMatchObject({ registered: true, disabled: false });
  },
);

it('preserves the owned extension when its own user or workspace configuration is disabled', () => {
  for (const scope of ['User', 'Workspace']) {
    const text = enabled.replace(`Enabled (${scope}): true`, `Enabled (${scope}): false`);
    expect(listing(text)).toMatchObject({ registered: true, disabled: true });
  }
});

it('does not mistake a similarly named extension or a package path for the owned extension', () => {
  const text = unrelated
    .replace('unrelated (', 'gamedevpl-cli-custom (')
    .replace('/unrelated/package', '/gamedevpl-cli/package');
  expect(listing(text)).toMatchObject({ registered: false, disabled: false });
  expect(listing('No extensions installed.')).toMatchObject({ registered: false, disabled: false });
});

it('refuses an unknown Gemini list format instead of assuming the native registration is gone', () => {
  expect(() => listing('gamedevpl-cli: enabled')).toThrow('unknown extension list format');
});

it('reads the real Gemini CLI output channel without dropping its stderr inventory', () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-gemini-streams-'));
  try {
    const script = `#!${process.execPath}\nprocess.stdout.write('Extension inventory:\\n');process.stderr.write(${JSON.stringify(enabled + '\n' + unrelated)});`;
    writeFileSync(join(root, 'gemini'), script, { mode: 0o700 });
    const env = { ...process.env, HOME: root, PATH: `${root}:${process.env.PATH}` };
    expect(nativePluginListing('gemini', env, root, runPluginTool)).toMatchObject({
      registered: true,
      disabled: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('preserves Gemini disablement rules for other workspaces without blocking disabled peers', () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-gemini-scope-'));
  const dir = join(root, '.gemini/extensions');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'extension-enablement.json');
  try {
    for (const own of [false, true]) {
      const content = JSON.stringify({
        unrelated: { overrides: ['!/*'] },
        'gamedevpl-cli': { overrides: own ? ['/*', '!/another/workspace/*'] : ['/*'] },
      });
      writeFileSync(file, content);
      expect(nativePluginListing('gemini', { HOME: root }, root, () => enabled + unrelated)).toMatchObject({
        registered: true,
        disabled: own,
      });
      expect(readFileSync(file, 'utf8')).toBe(content);
    }
    for (const value of [{ overrides: null }, null, false]) {
      writeFileSync(file, JSON.stringify({ 'gamedevpl-cli': value }));
      expect(() => nativePluginListing('gemini', { HOME: root }, root, () => enabled)).toThrow('unknown Gemini');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
