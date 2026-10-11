import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { installPreparedKit, recoverKitInstall } from './kit-install.js';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function put(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-kit-install-'));
  roots.push(root);
  const stage = join(root, '.gamedev/kit-stage-abcdef');
  for (const [dir, version] of [
    [root, 'old'],
    [stage, 'new'],
  ]) {
    put(
      dir!,
      '.gamedev/kit-manifest.json',
      JSON.stringify({ ignoreEntries: ['/tools/', '/kit.json', '/package.json'] }),
    );
    for (const path of [
      'tools/check.ts',
      'kit.json',
      'package.json',
      'gamedev.lock',
      'node_modules/dependency/index.js',
    ])
      put(dir!, path, version!);
  }
  put(root, 'games/airtime/game.ts', 'uncommitted hair changes');
  put(root, '.github/workflows/my-ci.yml', 'custom workflow');
  put(stage, '.gitignore', 'custom ignore\nmanaged kit');
  return { root, stage };
}
it('replaces the kit and dependencies while preserving game edits and custom workflow files', () => {
  const { root, stage } = fixture();
  installPreparedKit(root, stage);
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('new');
  expect(readFileSync(join(root, 'node_modules/dependency/index.js'), 'utf8')).toBe('new');
  expect(readFileSync(join(root, 'gamedev.lock'), 'utf8')).toBe('new');
  expect(readFileSync(join(root, 'games/airtime/game.ts'), 'utf8')).toBe('uncommitted hair changes');
  expect(readFileSync(join(root, '.github/workflows/my-ci.yml'), 'utf8')).toBe('custom workflow');
  expect(existsSync(stage)).toBe(false);
});
it('refuses incomplete staging without touching the installed kit', () => {
  const { root, stage } = fixture();
  rmSync(join(stage, 'node_modules'), { recursive: true });
  expect(() => installPreparedKit(root, stage)).toThrow('incomplete');
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
});
it('refuses game paths, unowned collisions, and dangling symlinks', () => {
  const { root, stage } = fixture();
  put(stage, '.gamedev/kit-manifest.json', JSON.stringify({ ignoreEntries: ['/games/'] }));
  expect(() => installPreparedKit(root, stage)).toThrow('cannot replace games');
  put(
    stage,
    '.gamedev/kit-manifest.json',
    JSON.stringify({ ignoreEntries: ['/tools/', '/kit.json', '/package.json', '/custom/'] }),
  );
  put(root, 'custom/file', 'mine');
  expect(() => installPreparedKit(root, stage)).toThrow('unowned');
  rmSync(join(root, 'custom'), { recursive: true });
  symlinkSync(join(root, 'missing'), join(root, 'custom'));
  expect(() => installPreparedKit(root, stage)).toThrow('symbolic link');
});
it('recovers an interrupted swap and leaves original game files intact', () => {
  const { root, stage } = fixture();
  mkdirSync(join(stage, 'backup'), { recursive: true });
  renameSync(join(root, 'tools'), join(stage, 'backup/tools'));
  renameSync(join(stage, 'tools'), join(root, 'tools'));
  put(
    root,
    '.gamedev/kit-update.json',
    JSON.stringify({
      stage: '.gamedev/kit-stage-abcdef',
      entries: [{ path: 'tools', existed: true }],
      committed: false,
    }),
  );
  recoverKitInstall(root);
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
  expect(readFileSync(join(root, 'games/airtime/game.ts'), 'utf8')).toBe('uncommitted hair changes');
  expect(existsSync(join(root, '.gamedev/kit-update.json'))).toBe(false);
});

it('rolls back a failed promotion, including dependencies and the pin', () => {
  const { root, stage } = fixture();
  let calls = 0;
  expect(() =>
    installPreparedKit(root, stage, (from, to) => {
      if (++calls === 3) throw new Error('disk failure');
      renameSync(from, to);
    }),
  ).toThrow('disk failure');
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
  expect(readFileSync(join(root, 'gamedev.lock'), 'utf8')).toBe('old');
  expect(readFileSync(join(root, 'node_modules/dependency/index.js'), 'utf8')).toBe('old');
});

it('migrates manifest-owned folders into an npm dependency and preserves local state', () => {
  const { root, stage } = fixture();
  put(root, '.gamedev/local-session.json', 'local session');
  put(root, 'shared/modules/core.ts', 'old engine');
  put(root, 'starters/sample/game.ts', 'old starter');
  put(
    root,
    '.gamedev/kit-manifest.json',
    JSON.stringify({
      ignoreEntries: ['/tools/', '/shared/', '/starters/', '/kit.json', '/package.json'],
    }),
  );
  rmSync(join(stage, 'tools'), { recursive: true });
  put(stage, '.gamedev/gamekit.tgz', 'verified package');
  put(stage, 'node_modules/@gamedevpl/gamekit/shared/modules/core.ts', 'new engine');
  put(
    stage,
    '.gamedev/kit-manifest.json',
    JSON.stringify({
      ignoreEntries: ['/.gamedev/gamekit.tgz', '/kit.json', '/package.json'],
    }),
  );
  installPreparedKit(root, stage);
  for (const path of ['tools', 'shared', 'starters']) expect(existsSync(join(root, path))).toBe(false);
  expect(readFileSync(join(root, '.gamedev/gamekit.tgz'), 'utf8')).toBe('verified package');
  expect(readFileSync(join(root, '.gamedev/local-session.json'), 'utf8')).toBe('local session');
  expect(readFileSync(join(root, 'games/airtime/game.ts'), 'utf8')).toBe('uncommitted hair changes');
});

it('refuses management of local state beyond the single npm package archive', () => {
  const { root, stage } = fixture();
  put(
    stage,
    '.gamedev/kit-manifest.json',
    JSON.stringify({
      ignoreEntries: ['/.gamedev/local-session.json', '/kit.json', '/package.json'],
    }),
  );
  expect(() => installPreparedKit(root, stage)).toThrow('cannot replace');
});

it('rolls back an npm migration if replacing dependencies fails', () => {
  const { root, stage } = fixture();
  rmSync(join(stage, 'tools'), { recursive: true });
  put(stage, '.gamedev/gamekit.tgz', 'new archive');
  put(
    stage,
    '.gamedev/kit-manifest.json',
    JSON.stringify({
      ignoreEntries: ['/.gamedev/gamekit.tgz', '/kit.json', '/package.json'],
    }),
  );
  expect(() =>
    installPreparedKit(root, stage, (source, destination) => {
      if (source === join(stage, 'node_modules')) throw new Error('dependency swap failed');
      renameSync(source, destination);
    }),
  ).toThrow('dependency swap failed');
  expect(readFileSync(join(root, 'tools/check.ts'), 'utf8')).toBe('old');
  expect(readFileSync(join(root, 'node_modules/dependency/index.js'), 'utf8')).toBe('old');
  expect(existsSync(join(root, '.gamedev/gamekit.tgz'))).toBe(false);
  expect(readFileSync(join(root, 'games/airtime/game.ts'), 'utf8')).toBe('uncommitted hair changes');
});
