import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { codeProjectId, readCodeFile, readCodeProject, saveCodeFile } from './workbench-code-files.js';
import { withCheckoutWriter } from './workbench-lock.js';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'play-code-'));
  roots.push(root);
  mkdirSync(join(root, 'games/demo/game'), { recursive: true });
  mkdirSync(join(root, 'shared'));
  mkdirSync(join(root, 'games/other'));
  writeFileSync(join(root, 'games/demo/game.ts'), 'export const score = 1;');
  writeFileSync(join(root, 'games/demo/game/logic.ts'), 'export const logic = 2;');
  writeFileSync(join(root, 'shared/game-kit.d.ts'), 'declare const GameKit: unknown;');
  writeFileSync(join(root, 'games/other/game.ts'), 'private project');
  writeFileSync(join(root, '.env'), 'PRIVATE_KEY=secret');
  const checkout = { root, slug: 'demo' };
  const file = readCodeFile(checkout, 'games/demo/game.ts');
  const request = {
    projectId: codeProjectId(checkout),
    path: file.path,
    version: file.version,
    content: 'export const score = 3;',
  };
  return { root, checkout, file, request };
}
it('lists only this game and read-only local kit, excluding secrets and links', () => {
  const { root, checkout } = fixture();
  symlinkSync(join(root, '.env'), join(root, 'games/demo/sneak.ts'));
  symlinkSync(join(root, 'games/other'), join(root, 'games/demo/escape'));
  const project = readCodeProject(checkout);
  expect(project.files.map((file) => file.path)).toEqual([
    'games/demo/game/logic.ts',
    'games/demo/game.ts',
    'shared/game-kit.d.ts',
  ]);
  expect(project.files.find((file) => file.path.startsWith('shared/'))?.readOnly).toBe(true);
  for (const path of [
    '../.env',
    '/etc/passwd',
    'games/other/game.ts',
    'games/demo/sneak.ts',
    'games/demo/escape/game.ts',
    'games/demo/../other/game.ts',
    'shared/../.env',
  ])
    expect(() => readCodeFile(checkout, path)).toThrow();
});
it('saves with a version and preserves changes made by an external editor', async () => {
  const { root, checkout, request } = fixture();
  const saved = await saveCodeFile(checkout, request, () => true);
  expect(saved.status).toBe('saved');
  expect(readFileSync(join(root, request.path), 'utf8')).toBe(request.content);
  expect(await saveCodeFile(checkout, request, () => true)).toMatchObject({ status: 'conflict' });
  const latest = readCodeFile(checkout, request.path);
  writeFileSync(join(root, request.path), 'external edit');
  expect(await saveCodeFile(checkout, { ...request, version: latest.version }, () => true)).toMatchObject({
    status: 'conflict',
    file: { content: 'external edit' },
  });
  expect(readFileSync(join(root, request.path), 'utf8')).toBe('external edit');
});
it('shares the agent writer lock across concurrent operations', async () => {
  const { root, checkout, request } = fixture();
  let release!: () => void;
  const writer = withCheckoutWriter(
    root,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await expect(saveCodeFile(checkout, request, () => true)).rejects.toThrow('Another CLI operation');
  release();
  await writer;
  expect((await saveCodeFile(checkout, request, () => true)).status).toBe('saved');
});
it('refuses stale projects, deleted files and kit writes', async () => {
  const { root, checkout, request } = fixture();
  expect(await saveCodeFile(checkout, request, () => false)).toEqual({ status: 'conflict' });
  expect(await saveCodeFile(checkout, { ...request, projectId: 'a'.repeat(64) }, () => true)).toEqual({
    status: 'conflict',
  });
  const kit = readCodeFile(checkout, 'shared/game-kit.d.ts');
  await expect(
    saveCodeFile(checkout, { ...request, path: kit.path, version: kit.version }, () => true),
  ).rejects.toThrow('read-only');
  rmSync(join(root, request.path));
  await expect(saveCodeFile(checkout, request, () => true)).rejects.toThrow();
});
