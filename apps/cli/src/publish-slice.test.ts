import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { writeBase } from './checkout.js';
import { memoryStore } from './keychain.js';
import {
  buildPublishSlice,
  collectReachableModules,
  parseEntryFlag,
  resolvePushTarget,
  stagePublishSlice,
} from './publish-slice.js';
import { formatSubmitLines, submitGame } from './submit.js';

const tempDirs: string[] = [];

function makeTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
const stubApi = (fetch: typeof globalThis.fetch) =>
  createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch,
  });

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('parseEntryFlag', () => {
  it('accepts top-level .ts entries and defaults bare --entry to publish.ts', () => {
    expect(parseEntryFlag(undefined)).toBeUndefined();
    expect(parseEntryFlag(false)).toBeUndefined();
    expect(parseEntryFlag(true)).toBe('publish.ts');
    expect(parseEntryFlag('publish.ts')).toBe('publish.ts');
    expect(parseEntryFlag('teaser.ts')).toBe('teaser.ts');
  });

  it('rejects nested, escaping or non-ts entries', () => {
    expect(() => parseEntryFlag('sub/publish.ts')).toThrow(/Invalid --entry/);
    expect(() => parseEntryFlag('../publish.ts')).toThrow(/Invalid --entry/);
    expect(() => parseEntryFlag('publish.js')).toThrow(/Invalid --entry/);
    expect(() => parseEntryFlag('')).toThrow(/Invalid --entry/);
  });
});

describe('resolvePushTarget', () => {
  it('prefers an explicit directory over an unrelated parent checkout', () => {
    const parent = makeTemp('gdpl-target-');
    writeFiles(parent, {
      '.gamedev-slug': 'parent-game',
      'nested/games/knights/SPEC.md': '# Knights Preview\n',
    });
    expect(resolvePushTarget('nested', parent, 'knights')).toEqual({
      dest: join(parent, 'nested'),
      slug: 'knights',
    });
  });

  it('prefers a nested .gamedev-slug over a parent checkout', () => {
    const parent = makeTemp('gdpl-nested-');
    writeFiles(parent, {
      '.gamedev-slug': 'parent-game',
      'preview/.gamedev-slug': 'knights',
    });
    expect(resolvePushTarget('preview', parent, null)).toEqual({
      dest: join(parent, 'preview'),
      slug: 'knights',
    });
  });

  it('climbs to the parent checkout from an inner game subdirectory', () => {
    const parent = makeTemp('gdpl-climb-');
    writeFiles(parent, {
      '.gamedev-slug': 'knights',
      'games/knights/SPEC.md': '# Knights\n',
    });
    expect(resolvePushTarget(undefined, join(parent, 'games/knights'), null)).toEqual({
      dest: parent,
      slug: 'knights',
    });
  });

  it('maps a source project generated .gamedev/local runtime back to the canonical source root', () => {
    const repo = makeTemp('gdpl-source-runtime-');
    writeFiles(repo, {
      'gamedev-kit.json': JSON.stringify({ engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) }),
      'src/SPEC.md': '---\nslug: airtime\n---\n',
      '.gamedev/local/.gamedev-slug': 'airtime',
    });
    expect(resolvePushTarget(undefined, join(repo, '.gamedev/local'), null)).toEqual({
      dest: repo,
      slug: 'airtime',
    });
    expect(resolvePushTarget('.gamedev/local', repo, null)).toEqual({
      dest: repo,
      slug: 'airtime',
    });
  });
});

describe('collectReachableModules & buildPublishSlice', () => {
  it('traces reachable modules, ignores comments/strings, and applies publish/ overrides', () => {
    const root = makeTemp('gdpl-slice-');
    writeFiles(root, {
      'games/knights/SPEC.md': '# Full Knights\n',
      'games/knights/GAME.json': '{"title":"Full Knights"}',
      'games/knights/game.ts': "import './game/settlement/village.ts';\nexport const full = true;\n",
      'games/knights/game/settlement/village.ts': 'export const villagers = 99;\n',
      'games/knights/game/shared/noise.ts': 'export const hash = (x: number) => x;\n',
      'games/knights/game/editor-content.ts': 'export const DEFAULT_CONTENT = { grain: 100 };\n',
      'games/knights/game/preview/palette.json': '{"sky":"#87ceeb"}',
      'games/knights/game/preview/runtime.ts': [
        "import { hash } from '../shared/noise.js';",
        "import { DEFAULT_CONTENT } from '../editor-content';",
        "import palette from './palette.json';",
        "// import './game/settlement/village.ts';",
        "/* export * from '../settlement/village.ts'; */",
        'export const note = "import \'./settlement/village.ts\'";',
        'export const start = () => ({ hash, DEFAULT_CONTENT, palette });',
      ].join('\n'),
      'games/knights/publish.ts': "import { start } from './game/preview/runtime.ts';\nstart();\n",
      'games/knights/publish/SPEC.md': '# Knights Preview\n',
      'games/knights/publish/GAME.json': '{"title":"Knights Preview"}',
      'games/knights/publish/game/editor-content.ts': 'export const DEFAULT_CONTENT = { tourSeconds: 16 };\n',
    });

    const reachable = collectReachableModules(join(root, 'games/knights'), 'publish.ts');
    expect(reachable).toEqual([
      'game/editor-content.ts',
      'game/preview/palette.json',
      'game/preview/runtime.ts',
      'game/shared/noise.ts',
    ]);

    const slice = buildPublishSlice(root, 'knights', 'publish.ts');
    const byPath = new Map(slice.files.map((f) => [f.path, f.content]));
    expect([...byPath.keys()]).toEqual([
      'GAME.json',
      'SPEC.md',
      'game.ts',
      'game/editor-content.ts',
      'game/preview/runtime.ts',
      'game/shared/noise.ts',
    ]);
    expect(byPath.get('game.ts')).toContain('./game/preview/runtime.ts');
    expect(byPath.get('SPEC.md')).toBe('# Knights Preview\n');
    expect(byPath.get('GAME.json')).toBe('{"title":"Knights Preview"}');
    expect(byPath.get('game/editor-content.ts')).toContain('tourSeconds: 16');
    expect(byPath.has('game/settlement/village.ts')).toBe(false);
    expect(byPath.has('publish.ts')).toBe(false);
  });

  it('traces imports introduced by override modules and includes manifest-declared rasters', () => {
    const root = makeTemp('gdpl-override-deps-');
    writeFiles(root, {
      'games/demo/SPEC.md': '# Demo\n',
      'games/demo/GAME.json': JSON.stringify({ images: { hero: 'cast/hero.png', valley: 'scenes/valley.webp' } }),
      'games/demo/cast/hero.png': 'aGVybw==',
      'games/demo/scenes/valley.webp': 'dmFsbGV5',
      'games/demo/game.ts': "import './game/settings.ts';\n",
      'games/demo/game/settings.ts': "import { secret } from './secret.ts';\nexport const cfg = secret;\n",
      'games/demo/game/secret.ts': 'export const secret = 1;\n',
      'games/demo/game/extra.ts': 'export const extra = 2;\n',
      'games/demo/publish.ts': "import { cfg } from './game/settings.ts';\nconsole.log(cfg);\n",
      'games/demo/publish/GAME.json': JSON.stringify({ images: { valley: 'scenes/valley.webp' } }),
      'games/demo/publish/game/settings.ts': "import { extra } from './extra.ts';\nexport const cfg = extra;\n",
    });

    const slice = buildPublishSlice(root, 'demo', 'publish.ts');
    expect(slice.files.map((f) => f.path)).toEqual([
      'GAME.json',
      'SPEC.md',
      'game.ts',
      'game/extra.ts',
      'game/settings.ts',
      'scenes/valley.webp',
    ]);
  });

  it('does not treat game/ as an override directory when entry is game.ts', () => {
    const root = makeTemp('gdpl-game-entry-');
    writeFiles(root, {
      'games/demo/SPEC.md': '# Demo\n',
      'games/demo/game.ts': "import { x } from './game/core.ts';\nconsole.log(x);\n",
      'games/demo/game/core.ts': 'export const x = 1;\n',
      'games/demo/game/unused.ts': 'export const y = 2;\n',
    });
    const slice = buildPublishSlice(root, 'demo', 'game.ts');
    expect(slice.files.map((f) => f.path)).toEqual(['SPEC.md', 'game.ts', 'game/core.ts']);
  });

  it('refuses escaping relative imports except shared/sim', () => {
    const root = makeTemp('gdpl-escape-');
    writeFiles(root, {
      'games/demo/publish.ts': "import { x } from '../other/secret.ts';\nconsole.log(x);\n",
    });
    expect(() => collectReachableModules(join(root, 'games/demo'), 'publish.ts')).toThrow(/escapes the game/);
  });

  it('refuses imports of game.ts or cyclic imports back to the renamed entry', () => {
    const root = makeTemp('gdpl-collide-');
    writeFiles(root, {
      'games/demo/game.ts': 'export const full = 1;\n',
      'games/demo/game/helper.ts': "import { full } from '../game.ts';\nexport const v = full;\n",
      'games/demo/publish.ts': "import { v } from './game/helper.ts';\nconsole.log(v);\n",
    });
    expect(() => buildPublishSlice(root, 'demo', 'publish.ts')).toThrow(/collides with mapping --entry publish.ts/);
    writeFiles(root, {
      'games/demo/game/helper.ts': "import { tag } from '../publish.ts';\nexport const v = tag;\n",
      'games/demo/publish.ts': "import { v } from './game/helper.ts';\nexport const tag = 1;\nconsole.log(v);\n",
    });
    expect(() => buildPublishSlice(root, 'demo', 'publish.ts')).toThrow(/imports publish.ts, which collides/);
  });

  it('handles strings/templates/regexes, constant dynamic import expressions, and refuses non-constant dynamic imports', () => {
    const root = makeTemp('gdpl-strings-');
    writeFiles(root, {
      'games/demo/SPEC.md': '# Demo\n',
      'games/demo/game/private.ts': 'export const secret = 1;\n',
      'games/demo/game/real.ts': 'export const ok = 2;\n',
      'games/demo/game/tpl-real.ts': 'export const tpl = 3;\n',
      'games/demo/game/concat.ts': 'export const cat = 4;\n',
      'games/demo/publish.ts': [
        'const a = "import(\'./game/private.ts\')";',
        "const b = `\nimport { secret } from './game/private.ts';\nimport('./game/private.ts');\n`;",
        "const c = /import\\('.\\/game\\/private.ts'\\)/;",
        'if (a) /[\'"]/g.test(a);',
        'const o = { import: (s: string) => s };',
        "o.import('./game/private.ts');",
        "export const loaded = `${await import('./game/real.ts')}` + String(import(`./game/tpl-real.ts`)) + String(import('./game/' + 'concat.ts'));",
        'console.log(a, b, c, loaded, import.meta.url);',
      ].join('\n'),
    });
    const slice = buildPublishSlice(root, 'demo', 'publish.ts');
    expect(slice.files.map((f) => f.path)).toEqual([
      'SPEC.md',
      'game.ts',
      'game/concat.ts',
      'game/real.ts',
      'game/tpl-real.ts',
    ]);
    writeFiles(root, { 'games/demo/publish.ts': 'const p = "./game/real.ts"; void import(p);\n' });
    expect(() => buildPublishSlice(root, 'demo', 'publish.ts')).toThrow(/constant string expression/);
  });

  it('rejects symlinked directories in imported modules and manifest raster paths', () => {
    const outside = makeTemp('gdpl-outside-');
    writeFiles(outside, { 'private.ts': 'export const leak = 1;\n', 'secret.png': 'c2VjcmV0' });
    const modRoot = makeTemp('gdpl-symlink-mod-');
    writeFiles(modRoot, {
      'games/demo/SPEC.md': '# Demo\n',
      'games/demo/publish.ts': "import { leak } from './game/link/private.ts';\nconsole.log(leak);\n",
    });
    mkdirSync(join(modRoot, 'games/demo/game'), { recursive: true });
    symlinkSync(outside, join(modRoot, 'games/demo/game/link'), 'dir');
    expect(() => buildPublishSlice(modRoot, 'demo', 'publish.ts')).toThrow(/symbolic link/);
    const imgRoot = makeTemp('gdpl-symlink-img-');
    writeFiles(imgRoot, {
      'games/demo/SPEC.md': '# Demo\n',
      'games/demo/GAME.json': JSON.stringify({ images: { leak: 'scenes/link/secret.png' } }),
      'games/demo/publish.ts': 'export const ok = 1;\n',
    });
    mkdirSync(join(imgRoot, 'games/demo/scenes'), { recursive: true });
    symlinkSync(outside, join(imgRoot, 'games/demo/scenes/link'), 'dir');
    expect(() => buildPublishSlice(imgRoot, 'demo', 'publish.ts')).toThrow(/symbolic link/);
  });

  it('traverses GAME.json.hot.behavior and its dependencies when declared in the effective manifest', () => {
    const root = makeTemp('gdpl-hot-');
    writeFiles(root, {
      'games/demo/SPEC.md': '# Hot Demo\n',
      'games/demo/GAME.json': JSON.stringify({
        hot: { protocol: 1, id: 'demo', stateVersion: 1, observationVersion: 1, behavior: 'game/behavior.ts' },
      }),
      'games/demo/game.ts': 'export default function boot(b: unknown) { return b; }\n',
      'games/demo/game/behavior.ts': "import { helper } from './helper.ts';\nexport default { update: helper };\n",
      'games/demo/game/helper.ts': 'export const helper = () => {};\n',
      'games/demo/game/unused.ts': 'export const unused = 1;\n',
      'games/demo/publish.ts': 'export const teaser = 1;\n',
      'games/demo/publish/GAME.json': JSON.stringify({ title: 'Demo Preview' }),
    });
    const fullHotSlice = buildPublishSlice(root, 'demo', 'game.ts');
    expect(fullHotSlice.files.map((f) => f.path)).toEqual([
      'GAME.json',
      'SPEC.md',
      'game.ts',
      'game/behavior.ts',
      'game/helper.ts',
    ]);
    const previewSlice = buildPublishSlice(root, 'demo', 'publish.ts');
    expect(previewSlice.files.map((f) => f.path)).toEqual(['GAME.json', 'SPEC.md', 'game.ts']);
  });

  it('stages a self-contained slice with working runtime links even from a relative dest', () => {
    const root = makeTemp('gdpl-stage-');
    writeFiles(root, {
      'package.json': '{"name":"kit"}',
      'tsconfig.json': '{}',
      'kit.json': '{"version":"1.0.0"}',
      'verify.mjs': 'process.exit(0);\n',
      'node_modules/.keep': '',
      'games/knights/SPEC.md': '# Preview\n',
      'games/knights/publish.ts': 'export const preview = 1;\n',
    });
    const relRoot = relative(process.cwd(), root);
    const slice = buildPublishSlice(relRoot, 'knights', 'publish.ts');
    const stageRoot = stagePublishSlice(relRoot, 'knights', slice.files);
    expect(readFileSync(join(stageRoot, 'games/knights/game.ts'), 'utf8')).toContain('preview = 1');
    expect(existsSync(join(stageRoot, 'package.json'))).toBe(true);
    expect(existsSync(join(stageRoot, 'verify.mjs'))).toBe(true);
    expect(lstatSync(join(stageRoot, 'node_modules')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(stageRoot, 'node_modules/.keep'))).toBe(true);
  });
});

describe('submitGame with --entry and --dry-run', () => {
  it('lists sliced files on --dry-run without touching the network', async () => {
    const root = makeTemp('gdpl-dry-');
    writeFiles(root, {
      'games/knights/SPEC.md': '# Full\n',
      'games/knights/game.ts': 'export const secretFull = true;\n',
      'games/knights/game/secret.ts': 'export const hidden = true;\n',
      'games/knights/game/preview/scene.ts': 'export const nature = true;\n',
      'games/knights/publish.ts': "import { nature } from './game/preview/scene.ts';\nconsole.log(nature);\n",
      'games/knights/publish/SPEC.md': '# Preview\n',
    });
    const api = stubApi(async () => {
      throw new Error('dry-run must not call network');
    });
    const result = await submitGame({ api, slug: 'knights', dest: root, entry: 'publish.ts', dryRun: true });
    expect(result.kind).toBe('dry-run');
    if (result.kind === 'dry-run') {
      expect(result.entry).toBe('publish.ts');
      expect(result.files.map((f) => f.path)).toEqual(['SPEC.md', 'game.ts', 'game/preview/scene.ts']);
      const lines = formatSubmitLines(result, 'knights');
      expect(lines[0]).toContain('dry-run knights (entry: publish.ts): 3 files');
      expect(lines).toContain('  game/preview/scene.ts');
    }
  });

  it('verifies in publish-slice, uploads only sliced files, deletes stale remote files, and preserves local full game', async () => {
    const root = makeTemp('gdpl-sliced-submit-');
    writeFiles(root, {
      'package.json': '{"name":"kit"}',
      'tsconfig.json': '{}',
      'games/knights/SPEC.md': '# Full\n',
      'games/knights/game.ts': 'export const fullGame = true;\n',
      'games/knights/game/settlement/village.ts': 'export const humans = 10;\n',
      'games/knights/game/preview/nature.ts': 'export const trees = 42;\n',
      'games/knights/publish.ts': "import { trees } from './game/preview/nature.ts';\nconsole.log(trees);\n",
      'games/knights/publish/SPEC.md': '# Nature Preview\n',
    });
    writeBase(root, 'v1', [
      { path: 'SPEC.md', content: '# Full\n' },
      { path: 'game.ts', content: 'export const fullGame = true;\n' },
    ]);

    const stagedPuts = new Map<string, string>();
    const deletedPaths: string[] = [];
    const verifyCwds: string[] = [];
    let remoteFiles = [
      { path: 'SPEC.md', content: '# Full\n' },
      { path: 'game.ts', content: 'export const fullGame = true;\n' },
      { path: 'game/settlement/village.ts', content: 'export const humans = 10;\n' },
    ];
    let remoteVersion = 'v1';

    const api = stubApi(async (url, init) => {
      const path = String(url);
      if (path.endsWith('/versions') && !path.includes('/tree')) {
        return json({ versions: [{ version: remoteVersion, createdAt: '2026-11-21', sourceFiles: [] }] });
      }
      if (path.includes('/tree')) return json({ version: remoteVersion, files: remoteFiles });
      if (path.endsWith('/sources/session')) return json({ locked: false, canTakeOver: true, jobId: 1, generation: 1 });
      if (path.endsWith('/sources')) return json({ files: remoteFiles });
      if (path.endsWith('/sources/stage') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { path: string; content: string };
        stagedPuts.set(body.path, body.content);
        return json({ accepted: true });
      }
      if (path.endsWith('/sources/stage/delete') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { path: string };
        deletedPaths.push(body.path);
        return json({ accepted: true });
      }
      if (path.endsWith('/sources/deliver')) {
        remoteVersion = 'v2';
        remoteFiles = [...stagedPuts.entries()].map(([p, c]) => ({ path: p, content: c }));
        return json({ accepted: true, version: 'v2', mode: 'preview', gateStarted: true, buildId: 'b2' });
      }
      return json({}, 404);
    });

    const result = await submitGame({
      api,
      slug: 'knights',
      dest: root,
      entry: 'publish.ts',
      run: (_cmd, _args, cwd) => {
        verifyCwds.push(cwd);
        return { status: 0, stderr: '' };
      },
    });

    expect(result.kind).toBe('delivered');
    expect(verifyCwds.length).toBeGreaterThan(0);
    expect(verifyCwds.every((cwd) => cwd.endsWith('/.gamedev/publish-slice'))).toBe(true);
    expect([...stagedPuts.keys()].sort()).toEqual(['SPEC.md', 'game.ts', 'game/preview/nature.ts']);
    expect(stagedPuts.get('game.ts')).toContain('./game/preview/nature.ts');
    expect(stagedPuts.get('SPEC.md')).toBe('# Nature Preview\n');
    expect(deletedPaths).toEqual(['game/settlement/village.ts']);
    expect(readFileSync(join(root, 'games/knights/game.ts'), 'utf8')).toBe('export const fullGame = true;\n');
    expect(readFileSync(join(root, '.gamedev-base.json'), 'utf8')).toContain('"v1"');
    expect(existsSync(join(root, '.gamedev/publish-slice/games/knights'))).toBe(false);

    const second = await submitGame({
      api,
      slug: 'knights',
      dest: root,
      entry: 'publish.ts',
      run: () => ({ status: 0, stderr: '' }),
    });
    expect(second.kind).toBe('nothing');
  });

  it('prepares a source-project runtime before staging and verifying a publish slice', async () => {
    const root = makeTemp('gdpl-src-slice-');
    writeFiles(root, {
      'package.json': JSON.stringify({ name: 'airtime-repo', scripts: { setup: 'echo setup' } }),
      'gamedev-kit.json': JSON.stringify({ engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) }),
      'src/SPEC.md': '---\nslug: airtime\n---\n',
      'src/game.ts': 'export const full = true;\n',
      'src/publish.ts': 'export const preview = true;\n',
    });

    const api = stubApi(async (url) => {
      const path = String(url);
      if (path.endsWith('/versions') && !path.includes('/tree')) return json({ versions: [] });
      if (path.endsWith('/sources/session')) return json({ locked: false, canTakeOver: true, jobId: 1, generation: 1 });
      if (path.endsWith('/sources')) return json({ files: [] });
      if (path.endsWith('/sources/stage')) return json({ accepted: true });
      if (path.endsWith('/sources/deliver'))
        return json({ accepted: true, version: 'v1', mode: 'preview', gateStarted: true, buildId: 'b1' });
      return json({}, 404);
    });

    const calls: Array<{ args: string[]; cwd: string; hasPkg: boolean }> = [];
    const result = await submitGame({
      api,
      slug: 'airtime',
      dest: root,
      entry: 'publish.ts',
      run: (_cmd, args, cwd) => {
        if (args.join(' ') === 'run setup') {
          writeFiles(join(root, '.gamedev/local'), {
            'package.json': '{"name":"kit"}',
            'tsconfig.json': '{}',
            'kit.json': '{"version":"1.0.0"}',
            '.gamedev-slug': 'airtime',
          });
        }
        calls.push({ args, cwd, hasPkg: existsSync(join(cwd, 'package.json')) });
        return { status: 0, stderr: '' };
      },
    });

    expect(result.kind).toBe('delivered');
    expect(calls[0]).toEqual({ args: ['run', 'setup'], cwd: root, hasPkg: true });
    expect(calls.slice(1).every((c) => c.cwd.endsWith('/.gamedev/publish-slice') && c.hasPkg)).toBe(true);
  });
});
