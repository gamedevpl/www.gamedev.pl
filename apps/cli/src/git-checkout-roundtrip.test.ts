import { afterEach, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitFixture } from '../test/git-checkout-fixture.js';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { reconcilePush } from './git-remote-main.js';
import { localGameFiles, readBase } from './checkout.js';
import { classify, hashContent, type TreeFile } from './checkout-sync.js';
import { historyScope, remoteLayout, checkoutGit } from './git-checkout-layout.js';

afterEach(cleanupHistoryFixtures);

async function fixture(project: boolean) {
  const f = gitFixture(project);
  await f.setup();
  const bin = join(f.root, 'fixture-bin');
  mkdirSync(bin);
  const module = join(bin, 'bridge.mjs'),
    data = join(bin, 'data.json'),
    delivery = join(bin, 'delivery.json');
  const source = fileURLToPath(new URL('./git-remote-main.ts', import.meta.url));
  buildSync({
    entryPoints: [source],
    outfile: module,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });
  symlinkSync(fileURLToPath(new URL('../../../node_modules', import.meta.url)), join(bin, 'node_modules'));
  writeFileSync(data, JSON.stringify({ versions: f.versions, trees: f.trees }));
  const helper = join(bin, 'git-remote-gamedevpl');
  writeFileSync(
    helper,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const file = path.join(__dirname, 'data.json');
global.fetch = async (value, init) => {
 const url = new URL(String(value)), data = JSON.parse(fs.readFileSync(file, 'utf8'));
 if (url.pathname.endsWith('/versions')) return Response.json({versions: data.versions, hasMore:false, nextCursor:null});
 if (url.pathname.endsWith('/tree')) {
  const version = url.pathname.split('/').at(-2);
  return Response.json({slug:'probe', version, metadata:data.versions.find(v => v.version === version), files:data.trees[version]});
 }
 if (url.pathname.endsWith('/sources/stage')) return Response.json({accepted:true});
 if (url.pathname.endsWith('/sources/deliver')) return Response.json({accepted:true, version:'delivered'});
 return Response.json({error:'unexpected fixture request'}, {status:500});
};
const submit = async ({dest}) => {
 const data = JSON.parse(fs.readFileSync(file, 'utf8')), version = 'v' + (data.versions.length + 1);
 const root = fs.existsSync(path.join(dest, 'gamedev-kit.json')) ? 'src' : 'games/probe', files = [];
 const walk = (dir, prefix='') => { for (const name of fs.readdirSync(dir)) {
  const abs = path.join(dir,name), rel = prefix + name;
  if (fs.statSync(abs).isDirectory()) walk(abs,rel+'/');
  else if (!rel.endsWith('.txt') && rel !== 'cache.ts') files.push({path:rel, content:fs.readFileSync(abs).toString(root==='src' && /[.](png|webp)$/i.test(rel) ? 'base64' : 'utf8')});
 }}; walk(path.join(dest,root));
 fs.writeFileSync(path.join(__dirname,'delivery.json'), JSON.stringify({base:JSON.parse(fs.readFileSync(path.join(dest,'.gamedev-base.json'),'utf8')),files}));
 data.trees[version]=files; data.versions.unshift({...data.versions[0],version,createdAt:'2026-10-05T00:00:00Z',sourceFiles:files.map(f=>f.path)}); fs.writeFileSync(file,JSON.stringify(data));
 return {kind:'delivered', version, files, ignored:[], staged:[]};
};
import(pathToFileURL(path.join(__dirname, 'bridge.mjs')).href).then(m => m.runGitRemoteHelper(process.argv, process.env,{submit})).then(code => process.exitCode=code).catch(e=>{console.error(e); process.exitCode=1;});
`,
  );
  chmodSync(helper, 0o755);
  const env = {
    ...process.env,
    PATH: bin + delimiter + process.env.PATH,
    GAMEDEV_ORIGIN: f.api.origin,
    GAMEDEV_TOKEN: 'fixture',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: f.root, env, encoding: 'utf8', timeout: 20_000 });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  return { ...f, git, data, delivery };
}

it.each([false, true])(
  'fetch/pull/stash preserve both sides and raster bytes, source repository=%s',
  async (project) => {
    const f = await fixture(project);
    writeFileSync(join(f.game, 'game.ts'), sourceLines(9, 3));
    f.git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'stash', 'push');
    const data = JSON.parse(readFileSync(f.data, 'utf8'));
    data.trees.v4 = data.trees.v3.map((file: { path: string; content: string }) =>
      file.path === 'game.ts' ? { ...file, content: sourceLines(2, 8) } : file,
    );
    data.versions.unshift({ ...data.versions[0], version: 'v4', createdAt: '2026-10-04T00:00:00Z' });
    writeFileSync(f.data, JSON.stringify(data));
    f.git('pull', '--ff-only');
    expect(f.git('log', '-1', '--format=%s')).toBe('v4');
    expect(f.git('status', '--porcelain', '--untracked-files=no')).toBe('');
    f.git('stash', 'pop');
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 8));
    expect(readFileSync(join(f.game, 'images/test.png'))).toEqual(
      project ? Buffer.from([0, 255, 2]) : Buffer.from(Buffer.from([0, 255, 2]).toString('base64')),
    );
    expect(f.git('config', '--get', 'remote.origin.gamedevpl-root')).toBe(f.prefix);
  },
);

it.each([false, true])(
  'push uses commit ancestry and remembers subsequent deliveries, source repository=%s',
  async (project) => {
    const f = await fixture(project);
    f.trees.v4 = f.trees.v3!.map((file) => (file.path === 'game.ts' ? { ...file, content: sourceLines(2, 8) } : file));
    f.versions.unshift({ ...f.versions[0]!, version: 'v4', createdAt: '2026-10-04T00:00:00Z' });
    writeFileSync(f.data, JSON.stringify({ versions: f.versions, trees: f.trees }));
    f.git('pull', '--ff-only');
    expect(readBase(f.root)?.version).toBe('v3');
    writeFileSync(join(f.game, 'game.ts'), sourceLines(9, 8));
    f.git('add', `${f.prefix}/game.ts`);
    f.commit('local change');
    const layout = remoteLayout(checkoutGit(f.root), 'probe', 'origin'),
      scope = historyScope(f.api.origin, 'probe', layout);
    let delivered: TreeFile[] = [];
    const push = async (version: string, expectedBase: string, baseContent: string, content: string) =>
      reconcilePush({
        api: f.api,
        slug: 'probe',
        cwd: f.root,
        srcRef: 'HEAD',
        layout,
        scope,
        submit: async ({ dest }) => {
          expect(readBase(dest)).toMatchObject({
            version: expectedBase,
            files: { 'game.ts': hashContent(baseContent) },
          });
          delivered = localGameFiles(dest, 'probe');
          expect(delivered.find((file) => file.path === 'game.ts')?.content).toBe(content);
          expect(delivered.find((file) => file.path === 'images/test.png')?.content).toBe(
            Buffer.from([0, 255, 2]).toString('base64'),
          );
          return { kind: 'delivered', version, files: delivered, staged: [], ignored: [] };
        },
      });
    writeFileSync(join(f.game, 'game.ts'), 'uncommitted draft\n');
    expect(await push('v5', 'v4', sourceLines(2, 8), sourceLines(9, 8))).toEqual({ ok: true });
    expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('uncommitted draft\n');
    f.trees.v5 = delivered;
    f.versions.unshift({
      ...f.versions[0]!,
      version: 'v5',
      createdAt: '2026-10-05T00:00:00Z',
      sourceFiles: delivered.map((file) => file.path),
    });
    writeFileSync(join(f.game, 'game.ts'), sourceLines(10, 8));
    f.git('add', `${f.prefix}/game.ts`);
    f.commit('next local change');
    expect(await push('v6', 'v5', sourceLines(9, 8), sourceLines(10, 8))).toEqual({ ok: true });
  },
);

it.each([false, true])('delivers only committed files through real git push, source repository=%s', async (project) => {
  const f = await fixture(project);
  writeFileSync(join(f.game, 'game.ts'), sourceLines(9, 3));
  f.git('add', `${f.prefix}/game.ts`);
  f.commit('committed game');
  writeFileSync(join(f.game, 'game.ts'), 'unsent editor draft\n');
  f.git('push', 'origin', 'HEAD:main');
  const receipt = JSON.parse(readFileSync(f.delivery, 'utf8'));
  expect(receipt.base.version).toBe('v3');
  expect(receipt.files.find((file: TreeFile) => file.path === 'game.ts').content).toBe(sourceLines(9, 3));
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe('unsent editor draft\n');
});

it('remembers a confirmed no-change push before the next local revision', async () => {
  const f = await fixture(false),
    layout = remoteLayout(checkoutGit(f.root), 'probe', 'origin');
  const scope = historyScope(f.api.origin, 'probe', layout);
  f.trees.v4 = f.trees.v3!.map((file) => (file.path === 'game.ts' ? { ...file, content: sourceLines(9, 3) } : file));
  f.versions.unshift({ ...f.versions[0]!, version: 'v4', createdAt: '2026-10-04T00:00:00Z' });
  writeFileSync(join(f.game, 'game.ts'), sourceLines(9, 3));
  f.git('add', `${f.prefix}/game.ts`);
  f.commit('same as platform');
  expect(
    await reconcilePush({
      api: f.api,
      slug: 'probe',
      cwd: f.root,
      srcRef: 'HEAD',
      layout,
      scope,
      submit: async ({ dest }) => {
        const sync = classify({
          local: localGameFiles(dest, 'probe'),
          remote: f.trees.v4!,
          remoteVersion: 'v4',
          base: readBase(dest),
        });
        expect(sync.kind).toBe('clean');
        return { kind: 'nothing', sync, ignored: [] };
      },
    }),
  ).toEqual({ ok: true });
  writeFileSync(join(f.game, 'game.ts'), sourceLines(10, 3));
  f.git('add', `${f.prefix}/game.ts`);
  f.commit('next revision');
  expect(
    await reconcilePush({
      api: f.api,
      slug: 'probe',
      cwd: f.root,
      srcRef: 'HEAD',
      layout,
      scope,
      submit: async ({ dest }) => {
        expect(readBase(dest)?.version).toBe('v4');
        return { kind: 'delivered', version: 'v5', files: localGameFiles(dest, 'probe'), staged: [], ignored: [] };
      },
    }),
  ).toEqual({ ok: true });
});

it('refuses an unrelated pushed branch instead of trusting the working-copy base', async () => {
  const f = await fixture(false);
  f.git('checkout', '--orphan', 'unrelated');
  f.git('read-tree', '--empty');
  f.git('add', `${f.prefix}/game.ts`);
  f.commit('unrelated local history');
  const layout = remoteLayout(checkoutGit(f.root), 'probe', 'origin'),
    scope = historyScope(f.api.origin, 'probe', layout);
  const result = await reconcilePush({
    api: f.api,
    slug: 'probe',
    cwd: f.root,
    srcRef: 'HEAD',
    layout,
    scope,
    submit: async () => {
      throw Error('must refuse before delivering');
    },
  });
  expect(result).toMatchObject({ ok: false, message: expect.stringContaining('no known platform base') });
});
