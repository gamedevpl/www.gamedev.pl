import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareWorkspace } from './prepare-workspace.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(setup = "import {writeFileSync} from 'node:fs'; writeFileSync('kit-ready', 'yes');") {
  const cwd = mkdtempSync(join(tmpdir(), 'gdpl-prepare-'));
  roots.push(cwd);
  writeFileSync(join(cwd, 'setup.mjs'), setup);
  writeFileSync(join(cwd, 'gamedev.lock'), '{}');
  writeFileSync(join(cwd, 'package.json'), '{}');
  mkdirSync(join(cwd, 'bin'));
  writeFileSync(
    join(cwd, 'bin/npm'),
    `#!${process.execPath}\nrequire('node:fs').writeFileSync('installed', process.argv.slice(2).join(' '));`,
    { mode: 0o700 },
  );
  return { cwd, env: { PATH: join(cwd, 'bin') }, write: () => undefined };
}
describe('checkout preparation', () => {
  it('prepares the kit before installing the toolchain', async () => {
    const input = fixture();
    await prepareWorkspace(input);
    expect(existsSync(join(input.cwd, 'kit-ready'))).toBe(true);
    expect(existsSync(join(input.cwd, 'installed'))).toBe(true);
  });
  it('does not run installation after setup fails or cancellation', async () => {
    const input = fixture('process.exit(1)');
    await expect(prepareWorkspace(input)).rejects.toThrow('setup did not complete');
    expect(existsSync(join(input.cwd, 'installed'))).toBe(false);
    const controller = new AbortController();
    controller.abort();
    await expect(prepareWorkspace({ ...input, abort: controller.signal })).rejects.toThrow('cancelled');
  });
});
