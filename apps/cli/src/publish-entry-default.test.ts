import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { parseArgv } from './argv.js';
import { writeBase } from './checkout.js';
import { memoryStore } from './keychain.js';
import { resolveDeliveryEntry } from './publish-slice.js';
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
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('default publish.ts entry and --full opt-out', () => {
  it('parses --full as a boolean flag without consuming the positional directory', () => {
    const parsed = parseArgv(['node', 'gamedevpl', 'push', '--full', './my-game']);
    expect(parsed.flags.full).toBe(true);
    expect(parsed.args).toEqual(['./my-game']);
  });

  it('auto-selects non-empty publish.ts, skips blank/ignored/symlinked publish.ts, and refuses --full + --entry', () => {
    const root = makeTemp('gdpl-auto-');
    writeFiles(root, {
      'games/knights/SPEC.md': '# Full\n',
      'games/knights/game.ts': 'export const full = 1;\n',
      'games/knights/publish.ts': 'export const preview = 1;\n',
    });

    expect(resolveDeliveryEntry(root, 'knights', undefined, false)).toEqual({ entry: 'publish.ts', auto: true });
    expect(resolveDeliveryEntry(root, 'knights', undefined, true)).toEqual({});
    expect(resolveDeliveryEntry(root, 'knights', 'teaser.ts', false)).toEqual({ entry: 'teaser.ts' });
    expect(() => resolveDeliveryEntry(root, 'knights', 'publish.ts', true)).toThrow(
      /Cannot combine --full with --entry/,
    );

    writeFiles(root, { 'games/knights/publish.ts': '   \n\t  ' });
    expect(resolveDeliveryEntry(root, 'knights', undefined, false)).toEqual({});

    writeFiles(root, {
      'games/knights/publish.ts': 'export const p = 1;\n',
      '.gamedevplignore': 'games/knights/publish.ts\n',
    });
    expect(resolveDeliveryEntry(root, 'knights', undefined, false)).toEqual({});

    const symRoot = makeTemp('gdpl-auto-sym-');
    const outside = makeTemp('gdpl-auto-out-');
    writeFiles(outside, { 'publish.ts': 'export const leak = 1;\n' });
    writeFiles(symRoot, { 'games/demo/game.ts': 'export const full = 1;\n' });
    symlinkSync(join(outside, 'publish.ts'), join(symRoot, 'games/demo/publish.ts'));
    expect(resolveDeliveryEntry(symRoot, 'demo', undefined, false)).toEqual({});
  });

  it('defaults submitGame --dry-run and push to publish.ts, and uploads full tree with --full', async () => {
    const root = makeTemp('gdpl-auto-submit-');
    writeFiles(root, {
      'package.json': '{"name":"kit"}',
      'tsconfig.json': '{}',
      'games/knights/SPEC.md': '# Full\n',
      'games/knights/game.ts': 'export const fullGame = true;\n',
      'games/knights/game/secret.ts': 'export const secret = 1;\n',
      'games/knights/game/preview/scene.ts': 'export const nature = true;\n',
      'games/knights/publish.ts': "import { nature } from './game/preview/scene.ts';\nconsole.log(nature);\n",
      'games/knights/publish/SPEC.md': '# Nature Preview\n',
    });
    writeBase(root, 'v1', [
      { path: 'SPEC.md', content: '# Full\n' },
      { path: 'game.ts', content: 'export const fullGame = true;\n' },
    ]);

    const offlineApi = stubApi(async () => {
      throw new Error('dry-run must not hit network');
    });

    const autoDry = await submitGame({ api: offlineApi, slug: 'knights', dest: root, dryRun: true });
    expect(autoDry.kind).toBe('dry-run');
    if (autoDry.kind === 'dry-run') {
      expect(autoDry.entry).toBe('publish.ts');
      expect(autoDry.autoEntry).toBe(true);
      expect(autoDry.files.map((f) => f.path)).toEqual(['SPEC.md', 'game.ts', 'game/preview/scene.ts']);
      expect(formatSubmitLines(autoDry, 'knights')[0]).toContain('default — pass --full for all files');
    }

    const fullDry = await submitGame({ api: offlineApi, slug: 'knights', dest: root, full: true, dryRun: true });
    expect(fullDry.kind).toBe('dry-run');
    if (fullDry.kind === 'dry-run') {
      expect(fullDry.entry).toBeUndefined();
      expect(fullDry.files.map((f) => f.path)).toContain('game/secret.ts');
      expect(fullDry.files.map((f) => f.path)).toContain('publish.ts');
    }

    const staged = new Map<string, string>();
    const api = stubApi(async (url, init) => {
      const path = String(url);
      if (path.endsWith('/versions') && !path.includes('/tree'))
        return json({ versions: [{ version: 'v1', createdAt: '2026-11-22', sourceFiles: [] }] });
      if (path.includes('/tree'))
        return json({ version: 'v1', files: [{ path: 'game.ts', content: 'export const fullGame = true;\n' }] });
      if (path.endsWith('/sources/session')) return json({ locked: false, canTakeOver: true, jobId: 1, generation: 1 });
      if (path.endsWith('/sources')) return json({ files: [] });
      if (path.endsWith('/sources/stage') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { path: string; content: string };
        staged.set(body.path, body.content);
        return json({ accepted: true });
      }
      if (path.endsWith('/sources/deliver'))
        return json({ accepted: true, version: 'v2', mode: 'preview', gateStarted: true, buildId: 'b2' });
      return json({}, 404);
    });

    const delivered = await submitGame({
      api,
      slug: 'knights',
      dest: root,
      run: () => ({ status: 0, stderr: '' }),
    });
    expect(delivered.kind).toBe('delivered');
    if (delivered.kind === 'delivered') {
      expect(delivered.entry).toBe('publish.ts');
      expect(delivered.autoEntry).toBe(true);
      expect(formatSubmitLines(delivered, 'knights')[0]).toBe('using publish.ts (pass --full to upload all files)');
    }
    expect([...staged.keys()].sort()).toEqual(['SPEC.md', 'game.ts', 'game/preview/scene.ts']);
    expect(readFileSync(join(root, 'games/knights/game.ts'), 'utf8')).toBe('export const fullGame = true;\n');
    expect(existsSync(join(root, '.gamedev/publish-slice/games/knights'))).toBe(false);
  });

  it('rejects delivery as stale when publish.ts is added or removed mid-verification', async () => {
    const root = makeTemp('gdpl-stale-auto-');
    writeFiles(root, {
      'games/demo/SPEC.md': '# Demo\n',
      'games/demo/game.ts': 'export const full = 1;\n',
      'games/demo/publish.ts': 'export const preview = 1;\n',
    });
    const api = stubApi(async (url) => {
      const path = String(url);
      if (path.endsWith('/versions')) return json({ versions: [] });
      return json({}, 404);
    });
    await expect(
      submitGame({
        api,
        slug: 'demo',
        dest: root,
        run: () => {
          rmSync(join(root, 'games/demo/publish.ts'), { force: true });
          return { status: 0, stderr: '' };
        },
      }),
    ).rejects.toThrow(/Sources changed during verification; result is stale/);
  });
});
