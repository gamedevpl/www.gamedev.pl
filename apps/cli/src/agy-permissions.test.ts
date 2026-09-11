import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, lstat, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { setupAgyPermissions } from './agy-permissions.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(raw?: string) {
  const root = await mkdtemp(join(tmpdir(), 'agy-settings-test-'));
  roots.push(root);
  const path = join(root, '.gemini', 'antigravity-cli', 'settings.json');
  await mkdir(dirname(path), { recursive: true });
  if (raw !== undefined) await writeFile(path, raw);
  const controller = new AbortController();
  const input = {
    env: { HOME: root },
    pick: vi.fn(async (choices: string[]) => choices[0]!),
    write: vi.fn(),
    abort: controller.signal,
  };
  return { root, path, input, controller };
}
it('preserves unrelated settings and permissions, backs up original bytes, remembers setup', async () => {
  const original = JSON.stringify({
    model: 'chosen',
    permissions: { ask: ['command(git push)'], deny: ['read_file(secret)'] },
    custom: 42,
  });
  const { path, input } = await fixture(original);
  expect(await setupAgyPermissions(input)).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
    ...JSON.parse(original),
    enableTerminalSandbox: true,
    toolPermission: 'proceed-in-sandbox',
  });
  const backup = (await readdir(dirname(path))).find((name) => name.endsWith('.bak'))!;
  expect(await readFile(join(dirname(path), backup), 'utf8')).toBe(original);
  expect(await setupAgyPermissions(input)).toBe(true);
  expect(input.pick).toHaveBeenCalledTimes(1);
});
it('creates a minimal profile without wildcard grants or bypass', async () => {
  const { path, input } = await fixture();
  expect(await setupAgyPermissions(input)).toBe(true);
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
    enableTerminalSandbox: true,
    toolPermission: 'proceed-in-sandbox',
  });
});
for (const option of [1, 2])
  it(`does not modify settings for alternative ${option}`, async () => {
    const { path, input } = await fixture('{}');
    input.pick.mockImplementation(async (choices) => choices[option]!);
    expect(await setupAgyPermissions(input)).toBe(option === 1);
    expect(await readFile(path, 'utf8')).toBe('{}');
  });
it('does not prompt or mutate in unattended mode', async () => {
  const { path, input } = await fixture('{}');
  expect(await setupAgyPermissions({ ...input, unattended: true })).toBe(true);
  expect(input.pick).not.toHaveBeenCalled();
  expect(await readFile(path, 'utf8')).toBe('{}');
});
it('refuses malformed profiles without replacing them', async () => {
  const { path, input } = await fixture('{broken');
  await expect(setupAgyPermissions(input)).rejects.toThrow('invalid');
  expect(input.pick).not.toHaveBeenCalled();
  expect(await readFile(path, 'utf8')).toBe('{broken');
});
it('does not overwrite changes made while the permission picker is open', async () => {
  const { path, input } = await fixture('{}');
  input.pick.mockImplementation(async (choices) => {
    await writeFile(path, '{"custom":1}');
    return choices[0]!;
  });
  await expect(setupAgyPermissions(input)).rejects.toThrow('changed during setup');
  expect(await readFile(path, 'utf8')).toBe('{"custom":1}');
  expect(await readdir(dirname(path))).toEqual(['settings.json']);
});
it('cancelling during the picker does not write settings', async () => {
  const { path, input, controller } = await fixture('{}');
  input.pick.mockImplementation(async (choices) => {
    controller.abort();
    return choices[0]!;
  });
  expect(await setupAgyPermissions(input)).toBe(false);
  expect(await readFile(path, 'utf8')).toBe('{}');
});
it('refuses to modify symlink profiles after explicit setup selection', async () => {
  const { root, path, input } = await fixture();
  const target = join(root, 'original.json');
  await writeFile(target, '{}');
  await symlink(target, path);
  await expect(setupAgyPermissions(input)).rejects.toThrow('safely read');
  expect(await readFile(target, 'utf8')).toBe('{}');
  expect((await lstat(path)).isSymbolicLink()).toBe(true);
  expect(input.pick).toHaveBeenCalledTimes(1);
});

it('does not configure unsupported sandbox platforms', async () => {
  const { path, input } = await fixture('{}');
  expect(await setupAgyPermissions({ ...input, platform: 'win32' })).toBe(true);
  expect(input.pick).not.toHaveBeenCalled();
  expect(await readFile(path, 'utf8')).toBe('{}');
});

for (const mode of ['current', 'unattended', 'configured', 'cancel'] as const) {
  it(`preserves symlink profiles when using ${mode} permissions`, async () => {
    const { root, path, input } = await fixture();
    const target = join(root, 'dotfiles.json');
    const raw =
      mode === 'configured'
        ? JSON.stringify({ enableTerminalSandbox: true, toolPermission: 'proceed-in-sandbox' })
        : '{}';
    await writeFile(target, raw);
    await symlink(target, path);
    input.pick.mockImplementation(async (choices) => choices[mode === 'cancel' ? 2 : 1]!);
    expect(await setupAgyPermissions({ ...input, unattended: mode === 'unattended' })).toBe(mode !== 'cancel');
    expect(await readFile(target, 'utf8')).toBe(raw);
    expect((await lstat(path)).isSymbolicLink()).toBe(true);
    expect(await readdir(dirname(path))).toEqual(['settings.json']);
    expect(input.pick).toHaveBeenCalledTimes(mode === 'current' || mode === 'cancel' ? 1 : 0);
  });
}
