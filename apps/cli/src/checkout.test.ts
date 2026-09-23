import { mkdirSync, mkdtempSync, writeFileSync, existsSync, symlinkSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  checkoutGame,
  classifyIncoming,
  diffGame,
  fetchLatestTree,
  changedPaths,
  findCheckout,
  ignoredGameFiles,
  inspectGame,
  localGameFiles,
  pullGame,
  readBase,
  unreconciledMessage,
  writeBase,
  writeGameFiles,
} from './checkout.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { CliError } from './exit-codes.js';

describe('checkout', () => {
  it('always inits git with a gamedevpl:// remote', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-co-'));
    const commands: string[] = [];
    const result = await checkoutGame({
      api: createApi({
        origin: 'https://www.gamedev.pl',
        store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
        fetch: async () => new Response('archive'),
      }),
      slug: 'ghost-roads',
      dest,
      fetchBuffer: async () => Buffer.from('archive'),
      run: (cmd, args) => {
        commands.push([cmd, ...args].join(' '));
      },
    });
    expect(result.remote).toBe('gamedevpl://ghost-roads');
    expect(commands).toContain('tar -xzf .gamedev-workspace.tgz');
    expect(commands).toContain('git init');
    expect(commands).toContain('git remote add origin gamedevpl://ghost-roads');
    expect(existsSync(join(dest, '.gamedev-workspace.tgz'))).toBe(false);
  });

  it('treats a missing remote file as unreconciled', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-df-'));
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'export const n = 1;\n');
    expect(changedPaths([{ path: 'game.ts', content: 'export const n = 1;\n' }], [])).toEqual(['game.ts']);
    expect(unreconciledMessage()).toContain('gamedevpl pull');
    expect(dirname(join(dest, 'games', 'ghost-roads', 'game.ts'))).toContain('ghost-roads');
  });

  it('removes local files the platform tree no longer has', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-pl-'));
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    writeFileSync(join(dest, 'games', 'ghost-roads', 'old.ts'), 'gone\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'keep\n');
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'next\n' }]);
    expect(existsSync(join(dest, 'games', 'ghost-roads', 'old.ts'))).toBe(false);
  });

  it('does not follow outbound symlinks when reconciling', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ln-'));
    const outside = mkdtempSync(join(tmpdir(), 'gdpl-out-'));
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'keep\n');
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'keep\n');
    symlinkSync(outside, join(dest, 'games', 'ghost-roads', 'leak'));
    expect(
      localGameFiles(dest, 'ghost-roads')
        .map((file) => file.path)
        .sort(),
    ).toEqual(['game.ts', 'leak']);
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'next\n' }]);
    expect(existsSync(secret)).toBe(true);
    expect(existsSync(join(dest, 'games', 'ghost-roads', 'leak'))).toBe(false);
  });

  it('unlinks a matching symlink before writing the pulled file', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ln2-'));
    const outside = mkdtempSync(join(tmpdir(), 'gdpl-out2-'));
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'keep\n');
    mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
    symlinkSync(secret, join(dest, 'games', 'ghost-roads', 'game.ts'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'next\n' }]);
    expect(readFileSync(secret, 'utf8')).toBe('keep\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('next\n');
  });

  it('pulls a platform-only update and keeps a local-only edit', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-pl3-'));
    writeGameFiles(dest, 'ghost-roads', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeBase(dest, 'v1', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({
              versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts', 'hud.ts'] }],
            }),
            {
              status: 200,
            },
          );
        }
        return new Response(
          JSON.stringify({
            version: 'v2',
            files: [
              { path: 'game.ts', content: 'A' },
              { path: 'hud.ts', content: 'H2' },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const pulled = await pullGame({ api, slug: 'ghost-roads', dest });
    expect(pulled.kept).toEqual(['game.ts']);
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'hud.ts'), 'utf8')).toBe('H2');
  });

  it('overwrites local files on pull --force and reports none kept', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-plf-'));
    writeGameFiles(dest, 'ghost-roads', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeBase(dest, 'v1', [
      { path: 'game.ts', content: 'A' },
      { path: 'hud.ts', content: 'h' },
    ]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({
              versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts', 'hud.ts'] }],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            version: 'v2',
            files: [
              { path: 'game.ts', content: 'A' },
              { path: 'hud.ts', content: 'H2' },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const pulled = await pullGame({ api, slug: 'ghost-roads', dest, force: true });
    expect(pulled.kept).toEqual([]);
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('A');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'hud.ts'), 'utf8')).toBe('H2');
  });

  it('refuses a conflicting pull without deleting local files', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-cf-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({ versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts'] }] }),
            {
              status: 200,
            },
          );
        }
        return new Response(JSON.stringify({ version: 'v2', files: [{ path: 'game.ts', content: 'C' }] }), {
          status: 200,
        });
      },
    });
    await expect(pullGame({ api, slug: 'ghost-roads', dest })).rejects.toMatchObject({
      message: expect.stringMatching(/conflict/),
    });
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
  });

  it('refuses pull on a legacy checkout that differs from the platform', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-lg-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'B' }]);
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] }),
            {
              status: 200,
            },
          );
        }
        return new Response(JSON.stringify({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] }), {
          status: 200,
        });
      },
    });
    await expect(pullGame({ api, slug: 'ghost-roads', dest })).rejects.toMatchObject({
      message: expect.stringMatching(/no base version/),
    });
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
  });

  it('advances a stale base when the working copy already matches the platform', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-base-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'C' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({ versions: [{ version: 'v2', createdAt: '2026-09-02', sourceFiles: ['game.ts'] }] }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ version: 'v2', files: [{ path: 'game.ts', content: 'C' }] }), {
          status: 200,
        });
      },
    });
    await inspectGame({ api, slug: 'ghost-roads', dest });
    expect(readBase(dest)?.version).toBe('v2');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'D');
    const after = await inspectGame({ api, slug: 'ghost-roads', dest });
    expect(after.sync.kind).toBe('local_only');
    expect(after.sync.conflict).toEqual([]);
  });

  it('refuses a path that would leave the checkout', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-esc2-'));
    expect(() => writeGameFiles(dest, 'ghost-roads', [{ path: '../outside.ts', content: 'nope' }])).toThrow(/outside/);
  });
});

// Inside a checkout, that game opens; no guessing.
describe('findCheckout', () => {
  it('finds the slug in the directory itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedev-find-'));
    writeFileSync(join(dir, '.gamedev-slug'), 'airtime\n');
    expect(findCheckout(dir)).toEqual({ slug: 'airtime', root: dir });
  });

  it('walks up from a subdirectory, so games/<slug>/ works', () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedev-find-'));
    writeFileSync(join(root, '.gamedev-slug'), 'airtime');
    const deep = join(root, 'games', 'airtime', 'game');
    mkdirSync(deep, { recursive: true });
    expect(findCheckout(deep)?.slug).toBe('airtime');
  });

  it('returns null outside a checkout', () => {
    expect(findCheckout(mkdtempSync(join(tmpdir(), 'gamedev-none-')))).toBeNull();
  });

  it('ignores an empty marker rather than opening a nameless game', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedev-empty-'));
    writeFileSync(join(dir, '.gamedev-slug'), '   \n');
    expect(findCheckout(dir)).toBeNull();
  });
});

it('uses an empty synchronization base for a game without deliveries', async () => {
  const api = createApi({
    origin: 'https://example.test',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async () => Response.json({ versions: [] }),
  });
  await expect(fetchLatestTree(api, 'fresh')).resolves.toEqual({ version: 'undelivered', files: [] });
});

function versionsApi(files: Array<{ path: string; content: string }>, version = 'v2') {
  return createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url) =>
      String(url).endsWith('/versions')
        ? new Response(
            JSON.stringify({
              versions: [{ version, createdAt: '2026-09-13', sourceFiles: files.map((file) => file.path) }],
            }),
            {
              status: 200,
            },
          )
        : new Response(JSON.stringify({ version, files }), { status: 200 }),
  });
}

describe('ignored working copy', () => {
  it('skips gitignored and .git paths, and keeps a tracked file inside an ignored directory', () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-'));
    writeFileSync(join(dest, '.gitignore'), 'node_modules/\n*.log\n');
    writeFileSync(join(dest, '.gamedevplignore'), '*.draft\n');
    mkdirSync(join(dest, 'games', 'ghost-roads', 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(dest, 'games', 'ghost-roads', '.git'));
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'keep\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'scratch.log'), 'noise\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'notes.draft'), 'wip\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'node_modules', 'pkg', 'index.js'), 'skip\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'node_modules', 'keep.js'), 'tracked\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', '.git', 'config'), 'nope\n');
    writeBase(dest, 'v1', [
      { path: 'game.ts', content: 'keep\n' },
      { path: 'node_modules/keep.js', content: 'tracked\n' },
    ]);
    expect(
      localGameFiles(dest, 'ghost-roads')
        .map((file) => file.path)
        .sort(),
    ).toEqual(['game.ts', 'node_modules/keep.js']);
    expect(
      ignoredGameFiles(dest, 'ghost-roads')
        .map((hit) => `${hit.source}:${hit.path}`)
        .sort(),
    ).toEqual(['gamedevplignore:notes.draft', 'git:.git', 'gitignore:node_modules/pkg', 'gitignore:scratch.log']);
  });

  it('leaves an ignored scratch file in place and refuses to overwrite one that disagrees', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-pull-'));
    writeFileSync(join(dest, '.gitignore'), '*.log\n');
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'scratch.log'), 'mine\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'shared.log'), 'local\n');
    const api = versionsApi([
      { path: 'game.ts', content: 'A2' },
      { path: 'shared.log', content: 'platform\n' },
    ]);
    const caught = await pullGame({ api, slug: 'ghost-roads', dest }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('shared.log');
    expect((caught as CliError).next).toContain('pull --force');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'scratch.log'), 'utf8')).toBe('mine\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'shared.log'), 'utf8')).toBe('local\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('A');
    const forced = await pullGame({ api, slug: 'ghost-roads', dest, force: true });
    expect(forced.notices.join('\n')).toContain('shared.log');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'shared.log'), 'utf8')).toBe('platform\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'scratch.log'), 'utf8')).toBe('mine\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('A2');
  });

  it('does not write a platform .git path and still updates the game', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-git-'));
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    mkdirSync(join(dest, 'games', 'ghost-roads', '.git'));
    writeFileSync(join(dest, 'games', 'ghost-roads', '.git', 'config'), 'local\n');
    const api = versionsApi([
      { path: 'game.ts', content: 'B' },
      { path: '.git/config', content: 'remote\n' },
    ]);
    const pulled = await pullGame({ api, slug: 'ghost-roads', dest });
    expect(pulled.notices.join('\n')).toContain('.git is never written');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', '.git', 'config'), 'utf8')).toBe('local\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
    expect(readBase(dest)?.files['.git/config']).toBeUndefined();
  });

  it('says when checkout replaces an ignored file and never writes .git', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-co-'));
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        if (String(url).endsWith('/versions')) {
          return new Response(
            JSON.stringify({
              versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts', 'scratch.log'] }],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            version: 'v1',
            files: [
              { path: 'game.ts', content: 'game\n' },
              { path: 'scratch.log', content: 'platform\n' },
              { path: '.git/config', content: 'remote\n' },
            ],
          }),
          { status: 200 },
        );
      },
    });
    const result = await checkoutGame({
      api,
      slug: 'ghost-roads',
      dest,
      fetchBuffer: async () => Buffer.from('archive'),
      run: (cmd) => {
        if (cmd !== 'tar') return;
        mkdirSync(join(dest, 'games', 'ghost-roads'), { recursive: true });
        writeFileSync(join(dest, '.gitignore'), '*.log\n');
        writeFileSync(join(dest, 'games', 'ghost-roads', 'scratch.log'), 'archive\n');
        writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'old\n');
      },
    });
    expect(result.notices.join('\n')).toContain('scratch.log');
    expect(result.notices.join('\n')).toContain('.git is never written');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'scratch.log'), 'utf8')).toBe('platform\n');
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('game\n');
    expect(existsSync(join(dest, 'games', 'ghost-roads', '.git', 'config'))).toBe(false);
    expect(readBase(dest)?.files['.git/config']).toBeUndefined();
  });

  it('shows a patch from diff and names ignored files', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-diff-'));
    writeFileSync(join(dest, '.gamedevplignore'), '*.draft\n');
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A\n' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A\n' }]);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B\n');
    writeFileSync(join(dest, 'games', 'ghost-roads', 'notes.draft'), 'wip\n');
    const report = await diffGame({
      api: versionsApi([{ path: 'game.ts', content: 'A\n' }], 'v1'),
      slug: 'ghost-roads',
      dest,
    });
    expect(report.kind).toBe('local_only');
    expect(report.patches.join('\n')).toContain('+B');
    expect(report.ignored.map((hit) => hit.path)).toEqual(['notes.draft']);
    expect(classifyIncoming(dest, 'ghost-roads', [{ path: 'notes.draft', content: 'other\n' }]).blocked).toEqual([
      'notes.draft',
    ]);
  });
});

it('refuses a conflicting pull with advice that matches the refusal', async () => {
  const dest = mkdtempSync(join(tmpdir(), 'pull-conflict-'));
  writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'A' }]);
  writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
  writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'B');
  const api = createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url) =>
      String(url).endsWith('/versions')
        ? new Response(
            JSON.stringify({ versions: [{ version: 'v2', createdAt: '2026-09-13', sourceFiles: ['game.ts'] }] }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ version: 'v2', files: [{ path: 'game.ts', content: 'C' }] }), { status: 200 }),
  });
  const caught = await pullGame({ api, slug: 'ghost-roads', dest }).catch((error: unknown) => error);
  expect(caught).toBeInstanceOf(CliError);
  const refused = caught as CliError;
  expect(refused.message).toContain('conflict on game.ts');
  // The old next sent a conflict to checkout, unprompted.
  expect(refused.next).toBe('gamedevpl diff');
  expect(refused.next).not.toContain('checkout');
  expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('B');
});
