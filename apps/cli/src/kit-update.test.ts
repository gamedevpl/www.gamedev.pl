import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { checkKit, offerKitUpdate, updateKit } from './kit-update.js';
import { prepareWorkspace } from './prepare-workspace.js';
import type { ApiClient } from './api.js';
vi.mock('./prepare-workspace.js', () => ({ prepareWorkspace: vi.fn() }));
vi.mock('./play.js', () => ({ startLocalPlay: vi.fn(async () => null) }));
const roots: string[] = [];
afterEach(() => {
  vi.resetAllMocks();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
function put(root: string, path: string, data: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-kit-update-'));
  roots.push(root);
  const old = { slug: 'airtime', engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) };
  const lock = {
    ...old,
    engineRef: 'c'.repeat(40),
    kitSha256: 'd'.repeat(64),
    kitUrl: 'https://example.test/kit?signed=secret',
    issuedAt: new Date().toISOString(),
  };
  put(root, '.gamedev-slug', 'airtime');
  put(root, 'gamedev.lock', JSON.stringify(old));
  put(
    root,
    '.gamedev/kit-manifest.json',
    JSON.stringify({ ...old, ignoreEntries: ['/tools/', '/package.json', '/kit.json'] }),
  );
  for (const path of ['setup.mjs', 'package.json', 'kit.json', 'tools/check.ts', 'node_modules/dependency/index.js'])
    put(root, path, 'old');
  put(root, 'games/airtime/game.ts', 'my hair edits');
  put(root, '.gitignore', 'my-custom-ignore');
  const api = { origin: 'https://example.test', request: vi.fn(async () => lock) } as unknown as ApiClient;
  return { root, lock, api, input: { api, cwd: root, env: {}, write: vi.fn() } };
}
it('offers an update but leaves the installation alone when postponed', async () => {
  const { input, root } = fixture();
  const pick = vi.fn(async () => 'Later');
  await offerKitUpdate({ ...input, pick });
  expect(pick).toHaveBeenCalledOnce();
  expect(prepareWorkspace).not.toHaveBeenCalled();
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
  expect(input.write).toHaveBeenCalledWith(expect.stringContaining('/kit'));
});
it('updates after consent using staging, preserving sources and custom ignore entries', async () => {
  const { input, root, lock } = fixture();
  vi.mocked(prepareWorkspace).mockImplementation(async ({ cwd }) => {
    expect(cwd).not.toBe(root);
    expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
    for (const path of ['tools/check.ts', 'package.json', 'kit.json', 'node_modules/dependency/index.js'])
      put(cwd, path, 'new');
    put(
      cwd,
      '.gamedev/kit-manifest.json',
      JSON.stringify({ ...lock, ignoreEntries: ['/tools/', '/package.json', '/kit.json'] }),
    );
  });
  await offerKitUpdate({ ...input, pick: async () => 'Update Creator Kit now' });
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('new');
  expect(readFileSync(join(root, 'games/airtime/game.ts'), 'utf8')).toBe('my hair edits');
  expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('my-custom-ignore');
  expect(JSON.parse(readFileSync(join(root, 'gamedev.lock'), 'utf8')).engineRef).toBe(lock.engineRef);
  expect((await checkKit(input)).current).toBe(true);
  expect(existsSync(join(root, '.gamedev/kit-update.pid'))).toBe(false);
});
it('keeps the installed kit when preparation fails', async () => {
  const { input, root } = fixture();
  vi.mocked(prepareWorkspace).mockRejectedValue(new Error('npm failed'));
  await expect(updateKit(input)).rejects.toThrow('npm failed');
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
  expect(readFileSync(join(root, 'node_modules/dependency/index.js'), 'utf8')).toBe('old');
  expect(existsSync(join(root, '.gamedev/kit-update.pid'))).toBe(false);
});
it('cancels a pending release lookup', async () => {
  const { input, api } = fixture();
  vi.mocked(api.request).mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const check = checkKit({ ...input, abort: controller.signal });
  controller.abort();
  await expect(check).rejects.toThrow('cancelled');
});
it('does not start a second update while an updater owns the checkout', async () => {
  const { input, root } = fixture();
  put(root, '.gamedev/kit-update.pid', String(process.pid));
  await expect(updateKit(input)).rejects.toThrow('Another Kit update');
  expect(prepareWorkspace).not.toHaveBeenCalled();
});

it('cancels after preparation without replacing the active kit', async () => {
  const { input, root } = fixture();
  const controller = new AbortController();
  vi.mocked(prepareWorkspace).mockImplementation(async () => {
    controller.abort();
  });
  await expect(updateKit({ ...input, abort: controller.signal })).rejects.toThrow();
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
  expect(existsSync(join(root, '.gamedev/kit-update.pid'))).toBe(false);
});
