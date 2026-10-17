import { readyToEdit } from './workshop.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { connectSession } from './connect-flow.js';
import { findCheckout, localGameFiles, writeGameFiles, writeBase, diffGame, pullGame } from './checkout.js';
import { projectRuntimeRoot, sourceProject } from './source-project.js';
import { syncSourceRuntime } from './source-project-runtime.js';
import { prepareWorkspace } from './prepare-workspace.js';
import { runLadder, runLadderAsync } from './verify.js';
import { readCodeIndex } from './workbench-code-index.js';
import { codeProjectId, readCodeFile, saveCodeFile } from './workbench-code-files.js';
import { startLocalPlay } from './play.js';
import { workshopBrief } from './workshop-brief.js';
import { submitGame } from './submit.js';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'source-project-'));
  roots.push(root);
  const put = (path: string, content: string | Uint8Array) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  put('gamedev-kit.json', JSON.stringify({ engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) }));
  put('src/SPEC.md', '---\ntitle: Airtime\nslug: airtime\n---\nA trampoline game.\n');
  put('src/GAME.json', '{"title":"Airtime","engine":{"modules":["drawing"]}}');
  put('src/game.ts', 'export const score = 1;');
  put('.git/config', '[remote "origin"]\nurl = https://github.com/gtanczyk/airtime.git\n');
  put('package.json', JSON.stringify({ scripts: { setup: 'node -e "process.exit(0)"' } }));
  const runtime = join(root, '.gamedev/local');
  put('.gamedev/local/.gamedev-slug', 'airtime');
  put(
    '.gamedev/local/kit.json',
    JSON.stringify({
      cliVerification: {
        typecheck: 'verify:types',
        checkStatic: 'verify:static',
        checkGame: 'verify:game',
      },
    }),
  );
  put(
    '.gamedev/local/package.json',
    JSON.stringify({
      type: 'module',
      scripts: {
        'verify:types': 'node verify.mjs',
        'verify:static': 'node verify.mjs',
        'verify:game': 'node verify.mjs',
      },
    }),
  );
  put(
    '.gamedev/local/verify.mjs',
    "import {readFileSync} from 'node:fs'; if (!readFileSync('games/airtime/game.ts','utf8').includes('score = 2')) process.exit(1);",
  );
  return { root, runtime, put };
}
function backend(files: ReturnType<typeof localGameFiles>, deliveredExtra: ReturnType<typeof localGameFiles> = []) {
  let current = files;
  const staged = new Map<string, string>();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/sources/stage') && init?.method === 'PUT') {
      const file = JSON.parse(String(init.body)) as { path: string; content: string };
      staged.set(file.path, file.content);
    }
    if (url.endsWith('/sources/deliver')) {
      const delivered = new Map(current.map((file) => [file.path, file]));
      for (const [path, content] of staged) delivered.set(path, { path, content });
      for (const file of deliveredExtra) delivered.set(file.path, file);
      current = [...delivered.values()];
    }
    const body = url.includes('/api/me/studio?')
      ? { games: [{ slug: 'airtime', token: 'tok' }] }
      : url.endsWith('/versions')
        ? { versions: [{ version: 'v1' }] }
        : url.endsWith('/tree')
          ? { version: 'v1', files: current }
          : url.endsWith('/recovery')
            ? { kind: 'active' }
            : url.endsWith('/sources/session')
              ? { locked: false }
              : url.endsWith('/sources/deliver')
                ? { accepted: true, version: 'v2' }
                : url.endsWith('/sources/stage') && init?.method === 'PUT'
                  ? { accepted: true }
                  : url.endsWith('/sources')
                    ? { files: [] }
                    : { status: 'building', builder: 'self' };
    return new Response(JSON.stringify(body));
  });
  const api = createApi({ origin: 'https://example.test', store: memoryStore({ accessToken: 't' }), fetch });
  return { api, fetch };
}

it('recognizes the SPEC slug at the repository root and inside src, preserving Git identity', () => {
  const { root, put } = fixture();
  put('src/logic/score.ts', 'export const score = 1;');
  put('airtime/.gamedev-slug', 'airtime');
  expect(findCheckout(root)).toEqual({ root, slug: 'airtime' });
  expect(findCheckout(join(root, 'src/logic'))).toEqual({ root, slug: 'airtime' });
  expect(readFileSync(join(root, '.git/config'), 'utf8')).toContain('gtanczyk/airtime.git');
  expect(existsSync(join(root, '.gamedev-slug'))).toBe(false);
  rmSync(join(root, 'src/game.ts'));
  expect(findCheckout(root)?.slug).toBe('airtime');
});

it.each(['.gamedev/local', '.gamedev/local/games/airtime'])(
  'opens canonical sources from generated runtime %s',
  async (cwd) => {
    const { root, runtime, put } = fixture();
    syncSourceRuntime(root);
    put('.gamedev/local/games/airtime/game.ts', 'temporary generated runtime edits');
    const here = join(root, cwd);
    expect(findCheckout(here)).toEqual({ root, slug: 'airtime' });
    const { api, fetch } = backend(localGameFiles(root, 'airtime'));
    const result = await connectSession({
      api,
      slug: 'airtime',
      cwd: here,
      env: { PATH: '' },
      pick: async (choices) => choices[0]!,
      abort: { current: null },
      write: () => {},
    });
    expect(result?.workshop?.root).toBe(root);
    const index = await readCodeIndex(result!.workshop!);
    expect(index.files.map((file) => file.path)).toContain('src/game.ts');
    const diff = await diffGame({ api, slug: 'airtime', dest: result!.workshop!.root });
    expect(diff.kind).toBe('clean');
    expect(readFileSync(join(runtime, 'games/airtime/game.ts'), 'utf8')).toBe('temporary generated runtime edits');
    expect(fetch.mock.calls.some(([url]) => url.includes('/workspace'))).toBe(false);
  },
);

it.each(['src', 'src/SPEC.md', 'gamedev-kit.json'])('does not recognize symbolic project paths: %s', (path) => {
  const { root } = fixture();
  const moved = join(root, 'saved');
  const target = join(root, path);
  const content = path === 'src' ? null : readFileSync(target);
  rmSync(target, { recursive: true });
  if (content) writeFileSync(moved, content);
  else mkdirSync(moved);
  symlinkSync(moved, target);
  expect(() => sourceProject(root)).toThrow('Invalid source repository metadata');
});

it('reuses repository sources when connecting, even when a nested checkout already exists', async () => {
  const { root, put } = fixture();
  put('airtime/.gamedev-slug', 'airtime');
  put('src/game.ts', 'my unsubmitted repository edits');
  const { api, fetch } = backend(localGameFiles(root, 'airtime'));
  const result = await connectSession({
    api,
    slug: 'airtime',
    cwd: root,
    env: { PATH: '' },
    pick: async (choices) => choices[0]!,
    abort: { current: null },
    write: () => {},
  });
  expect(result?.workshop?.root).toBe(root);
  expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe('my unsubmitted repository edits');
  expect(fetch.mock.calls.some(([url]) => url.includes('/workspace'))).toBe(false);
  expect(existsSync(join(root, 'games'))).toBe(false);
  expect(workshopBrief('airtime', 'change score', undefined, root)).toContain('Edit src/ only');
});

it('diffs, pulls and ignores files using src paths, keeping repository files intact', async () => {
  const { root, put } = fixture();
  const before = localGameFiles(root, 'airtime');
  writeBase(root, 'v1', before);
  put('.gitignore', '/src/private.ts\n');
  put('src/private.ts', 'secret local data');
  put('src/note.txt', 'local notes');
  put('src/game.ts', 'export const score = 2;');
  const { api } = backend(before);
  const diff = await diffGame({ api, slug: 'airtime', dest: root });
  expect(diff.kind).toBe('local_only');
  expect(diff.local).toEqual(['game.ts']);
  expect((await pullGame({ api, slug: 'airtime', dest: root })).kept).toContain('game.ts');
  await pullGame({ api, slug: 'airtime', dest: root, force: true });
  expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe('export const score = 1;');
  expect(readFileSync(join(root, 'src/private.ts'), 'utf8')).toBe('secret local data');
  expect(readFileSync(join(root, 'src/note.txt'), 'utf8')).toBe('local notes');
  expect(readFileSync(join(root, '.git/config'), 'utf8')).toContain('gtanczyk/airtime.git');
  expect(existsSync(join(root, 'games'))).toBe(false);
});

it('updates only the build copy, propagating additions and deletions and rejecting runtime links', () => {
  const { root, runtime, put } = fixture();
  put('.gamedev/local/games/airtime/stale.ts', 'stale');
  expect(syncSourceRuntime(root)).toBe(runtime);
  expect(existsSync(join(runtime, 'games/airtime/stale.ts'))).toBe(false);
  expect(readFileSync(join(runtime, 'games/airtime/game.ts'), 'utf8')).toBe('export const score = 1;');
  put('src/new.ts', 'new');
  rmSync(join(root, 'src/game.ts'));
  syncSourceRuntime(root);
  expect(existsSync(join(runtime, 'games/airtime/game.ts'))).toBe(false);
  expect(readFileSync(join(runtime, 'games/airtime/new.ts'), 'utf8')).toBe('new');
  rmSync(join(runtime, 'games/airtime/new.ts'));
  symlinkSync(join(root, '.git/config'), join(runtime, 'games/airtime/new.ts'));
  expect(() => syncSourceRuntime(root)).toThrow('symbolic link');
});

it('edits src files through Code without exposing sibling checkouts or repository scripts', async () => {
  const { root } = fixture();
  const checkout = { root, slug: 'airtime' };
  const index = await readCodeIndex(checkout);
  expect(index.files.map((f) => f.path)).toContain('src/game.ts');
  const file = readCodeFile(checkout, 'src/game.ts');
  const result = await saveCodeFile(
    checkout,
    { projectId: codeProjectId(checkout), path: file.path, version: file.version, content: 'export const score = 2;' },
    () => true,
  );
  expect(result.status).toBe('saved');
  expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe('export const score = 2;');
  expect(() => readCodeFile(checkout, 'games/airtime/game.ts')).toThrow();
  expect(() => readCodeFile(checkout, 'package.json')).toThrow();
});

it('prepares and verifies the current src snapshot in the pinned runtime', async () => {
  const { root, runtime, put } = fixture();
  put('src/game.ts', 'export const score = 2;');
  await prepareWorkspace({ cwd: root, env: process.env, write: () => {} });
  expect(runLadder({ cwd: root, slug: 'airtime', publish: false })).toEqual({ ok: true });
  put('src/game.ts', 'export const score = 3;');
  const result = await runLadderAsync({ cwd: root, slug: 'airtime', abort: new AbortController().signal });
  expect(result).toMatchObject({ ok: false, stage: 'typecheck' });
  expect(readFileSync(join(runtime, 'games/airtime/game.ts'), 'utf8')).toBe('export const score = 3;');
});

it('delivers only changed src files after verifying that same source snapshot', async () => {
  const { root, runtime, put } = fixture();
  const before = localGameFiles(root, 'airtime');
  writeBase(root, 'v1', before);
  put('src/game.ts', 'export const score = 2;');
  const { api, fetch } = backend(before);
  const verified = vi.fn((_cmd: string, _args: string[], cwd: string) => {
    if (cwd === runtime) expect(readFileSync(join(runtime, 'games/airtime/game.ts'), 'utf8')).toContain('score = 2');
    return { status: 0, stderr: '' };
  });
  const result = await submitGame({ api, slug: 'airtime', dest: root, run: verified });
  expect(result.kind).toBe('delivered');
  const staged = fetch.mock.calls.filter(([url]) => url.endsWith('/sources/stage'));
  expect(staged).toHaveLength(1);
  expect(JSON.parse(String(staged[0]![1]?.body))).toMatchObject({
    path: 'game.ts',
    content: 'export const score = 2;',
  });
  expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toContain('score = 2');
});

it('previews repository edits and refreshes the build copy without changing session root', async () => {
  const { root, runtime, put } = fixture();
  put(
    '.gamedev/local/tools/lib/assemble.ts',
    "import {readFileSync} from 'node:fs'; export const assembleGame=()=>({html:'<!doctype html><canvas></canvas>'+readFileSync('games/airtime/game.ts','utf8')});",
  );
  symlinkSync(resolve('../../node_modules'), join(runtime, 'node_modules'), 'dir');
  const session = await startLocalPlay({ root, slug: 'airtime', env: process.env, write: () => {}, prepared: true });
  expect(session?.root).toBe(root);
  try {
    await vi.waitFor(
      async () => expect(await fetch(session!.url + 'game').then((r) => r.text())).toContain('score = 1'),
      { timeout: 10_000 },
    );
    put('src/game.ts', 'export const score = 22;');
    await vi.waitFor(
      async () => expect(await fetch(session!.url + 'game').then((r) => r.text())).toContain('score = 22'),
      { timeout: 10_000 },
    );
    put('src/SPEC.md', '---\ntitle: Airtime\n---\n');
    await vi.waitFor(
      async () =>
        expect(await fetch(session!.url + 'status').then((r) => r.json())).toMatchObject({
          error: expect.stringContaining('Invalid source repository metadata'),
          stale: true,
        }),
      { timeout: 5_000 },
    );
    put('src/SPEC.md', '---\nslug: airtime\n---\n');
    put('src/game.ts', 'export const score = 33;');
    await vi.waitFor(
      async () => expect(await fetch(session!.url + 'game').then((r) => r.text())).toContain('score = 33'),
      { timeout: 10_000 },
    );
  } finally {
    await startLocalPlay({ root, slug: 'airtime', env: process.env, write: () => {}, stop: true });
  }
});

it('allows local edits in an unbased source repository while delivery still requires reconciliation', async () => {
  const { root, put } = fixture();
  const before = localGameFiles(root, 'airtime');
  put('src/game.ts', 'export const score = 2;');
  const { api } = backend(before);
  const ws = { root, slug: 'airtime', token: 'tok', builder: 'self' };
  const messages: string[] = [];
  expect(
    await readyToEdit({ api, ws: ws as Parameters<typeof readyToEdit>[0]['ws'], write: (line) => messages.push(line) }),
  ).toBe(true);
  expect(messages.join('\n')).toContain('review /diff');
  await expect(submitGame({ api, slug: 'airtime', dest: root })).rejects.toThrow('no base version');
  await expect(pullGame({ api, slug: 'airtime', dest: root })).rejects.toMatchObject({
    message: expect.stringContaining('gamedevpl pull --force'),
    next: 'gamedevpl diff',
  });
  expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe('export const score = 2;');
  expect(existsSync(join(root, '.gamedev-base.json'))).toBe(false);
  await pullGame({ api, slug: 'airtime', dest: root, force: true });
  expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe('export const score = 1;');
  expect(JSON.parse(readFileSync(join(root, '.gamedev-base.json'), 'utf8'))).toMatchObject({
    version: 'v1',
    slug: 'airtime',
  });
  expect((await diffGame({ api, slug: 'airtime', dest: root })).kind).toBe('clean');
  expect(readFileSync(join(root, '.git/config'), 'utf8')).toContain('gtanczyk/airtime.git');
  expect(existsSync(join(root, 'games'))).toBe(false);
});

it.each(['"airtime"', "'airtime'", '  "airtime"  '])('recognizes a quoted SPEC slug: %s', (slug) => {
  const { root, put } = fixture();
  put('src/SPEC.md', `---\r\n  slug: ${slug}\r\n---\r\n`);
  expect(findCheckout(root)).toEqual({ root, slug: 'airtime' });
  expect(findCheckout(join(root, 'src'))).toEqual({ root, slug: 'airtime' });
});

it.each(['"../airtime"', "'air time'", '"AIRTIME"', '""'])('rejects an invalid quoted SPEC slug: %s', (slug) => {
  const { root, put } = fixture();
  put('src/SPEC.md', `---\nslug: ${slug}\n---\n`);
  expect(() => sourceProject(root)).toThrow('Invalid source repository metadata');
});

it('removes deleted mirror files even when runtime ignore rules hide them', () => {
  const { root, runtime, put } = fixture();
  put('src/game/old.ts', 'old game logic');
  syncSourceRuntime(root);
  put('.gamedev/local/.gitignore', 'games/airtime/game/old.ts\n');
  rmSync(join(root, 'src/game/old.ts'));
  syncSourceRuntime(root);
  expect(existsSync(join(runtime, 'games/airtime/game/old.ts'))).toBe(false);
  expect(readFileSync(join(runtime, 'games/airtime/game.ts'), 'utf8')).toBe('export const score = 1;');
});

it.each([
  ['images/hero.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC8sAAAAASUVORK5CYII='],
  ['cast/hero.webp', 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'],
])('preserves binary raster bytes across mirror, delivery and pull: %s', async (path, content) => {
  const { root, runtime, put } = fixture();
  put('src/game.ts', 'export const score = 2;');
  const before = localGameFiles(root, 'airtime');
  writeBase(root, 'v1', before);
  const raw = Buffer.from(content!, 'base64');
  put(`src/${path}`, raw);
  expect(localGameFiles(root, 'airtime')).toContainEqual({ path, content });
  syncSourceRuntime(root);
  expect(readFileSync(join(runtime, 'games/airtime', path!))).toEqual(raw);
  const returnedPath = path!.replace('hero', 'server');
  const { api, fetch } = backend(before, [{ path: returnedPath, content: content! }]);
  const result = await submitGame({ api, slug: 'airtime', dest: root });
  expect(result.kind).toBe('delivered');
  const stage = fetch.mock.calls.filter(([url]) => url.endsWith('/sources/stage'));
  expect(stage).toHaveLength(1);
  expect(JSON.parse(String(stage[0]![1]?.body))).toEqual({ path, content });
  expect(readFileSync(join(root, 'src', returnedPath))).toEqual(raw);
  put(`src/${path}`, Buffer.from([0, 255, 254]));
  await pullGame({ api, slug: 'airtime', dest: root, force: true });
  expect(readFileSync(join(root, 'src', path!))).toEqual(raw);
  syncSourceRuntime(root);
  expect(readFileSync(join(runtime, 'games/airtime', path!))).toEqual(raw);
});

it.each(['YWJj!!!', 'YWJj='])('refuses damaged raster transport before deleting sources: %s', (content) => {
  const { root } = fixture();
  const before = localGameFiles(root, 'airtime');
  expect(() => writeGameFiles(root, 'airtime', [{ path: 'images/hero.png', content }], { force: true })).toThrow(
    'Invalid base64 raster content',
  );
  expect(localGameFiles(root, 'airtime')).toEqual(before);
  expect(existsSync(join(root, 'src/images/hero.png'))).toBe(false);
});

it.each(['base', 'unbased connect', 'legacy runtime'])(
  'refuses a changed source identity established by %s',
  async (binding) => {
    const { root, runtime, put } = fixture();
    const before = localGameFiles(root, 'airtime');
    const { api, fetch } = backend(before);
    if (binding === 'unbased connect') {
      rmSync(runtime, { recursive: true });
      put('src/game.ts', 'unbased local edits');
      await connectSession({
        api,
        slug: 'airtime',
        cwd: root,
        env: { PATH: '' },
        pick: async (choices) => choices[0]!,
        abort: { current: null },
        write: () => {},
      });
      expect(existsSync(join(root, '.gamedev-base.json'))).toBe(false);
    } else {
      writeBase(root, 'v1', before);
      if (binding === 'base') {
        expect(JSON.parse(readFileSync(join(root, '.gamedev-base.json'), 'utf8'))).toMatchObject({ slug: 'airtime' });
        rmSync(runtime, { recursive: true });
        rmSync(join(root, '.gamedev/source-slug'), { force: true });
      } else {
        const base = JSON.parse(readFileSync(join(root, '.gamedev-base.json'), 'utf8'));
        delete base.slug;
        put('.gamedev-base.json', JSON.stringify(base));
        rmSync(join(root, '.gamedev/source-slug'), { force: true });
      }
    }
    put('src/SPEC.md', '---\nslug: sky\n---\n');
    const game = readFileSync(join(root, 'src/game.ts'), 'utf8');
    fetch.mockClear();
    expect(() => findCheckout(root)).toThrow('Invalid source repository metadata');
    expect(() => localGameFiles(root, 'sky')).toThrow('Invalid source repository metadata');
    const request = { api, slug: 'sky', dest: root };
    await expect(diffGame(request)).rejects.toThrow('Invalid source repository metadata');
    await expect(pullGame({ ...request, force: true })).rejects.toThrow('Invalid source repository metadata');
    await expect(submitGame({ ...request, force: true, run: () => ({ status: 0, stderr: '' }) })).rejects.toThrow(
      'Invalid source repository metadata',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe(game);
    expect(readFileSync(join(root, 'src/SPEC.md'), 'utf8')).toContain('slug: sky');
  },
);

it.each(['.gamedev-base.json', '.gamedev/source-slug'])('refuses symbolic identity files: %s', (path) => {
  const { root } = fixture();
  const files = localGameFiles(root, 'airtime');
  const original = readFileSync(join(root, '.git/config'), 'utf8');
  symlinkSync(join(root, '.git/config'), join(root, path));
  expect(() => sourceProject(root)).toThrow('symbolic link');
  expect(() => writeBase(root, 'v1', files)).toThrow('symbolic link');
  expect(readFileSync(join(root, '.git/config'), 'utf8')).toBe(original);
});

it.each([
  'missing slug',
  'malformed pin',
  'invalid pin',
  'missing pin',
  'missing SPEC',
  'missing src',
  'missing metadata',
])('refuses damaged source metadata before diff, writes or delivery: %s', async (damage) => {
  const { root, runtime, put } = fixture();
  const before = localGameFiles(root, 'airtime');
  const { api, fetch } = backend(before);
  writeBase(root, 'v1', before);
  syncSourceRuntime(root);
  if (damage === 'missing slug') put('src/SPEC.md', '---\ntitle: Airtime\n---\n');
  if (damage === 'malformed pin') put('gamedev-kit.json', '{');
  if (damage === 'invalid pin') put('gamedev-kit.json', '{"engineRef":"invalid"}');
  if (damage === 'missing pin' || damage === 'missing metadata') rmSync(join(root, 'gamedev-kit.json'));
  if (damage === 'missing SPEC' || damage === 'missing metadata') rmSync(join(root, 'src/SPEC.md'));
  if (damage === 'missing src') rmSync(join(root, 'src'), { recursive: true });
  const request = { api, slug: 'airtime', dest: root };
  expect(() => findCheckout(runtime)).toThrow('Invalid source repository metadata');
  expect(() => localGameFiles(root, 'airtime')).toThrow('Invalid source repository metadata');
  await expect(diffGame(request)).rejects.toThrow('Invalid source repository metadata');
  await expect(pullGame({ ...request, force: true })).rejects.toThrow('Invalid source repository metadata');
  await expect(submitGame({ ...request, force: true, run: () => ({ status: 0, stderr: '' }) })).rejects.toThrow(
    'Invalid source repository metadata',
  );
  expect(() => writeGameFiles(root, 'airtime', before, { force: true })).toThrow('Invalid source repository metadata');
  expect(() => projectRuntimeRoot(root)).toThrow('Invalid source repository metadata');
  expect(() => syncSourceRuntime(root)).toThrow('Invalid source repository metadata');
  expect(fetch.mock.calls.every(([, init]) => !init || init.method === 'GET')).toBe(true);
  expect(existsSync(join(root, 'games'))).toBe(false);
  expect(readFileSync(join(runtime, 'games/airtime/game.ts'), 'utf8')).toBe('export const score = 1;');
  if (damage !== 'missing src') expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe('export const score = 1;');
});
