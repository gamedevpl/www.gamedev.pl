import { describe, expect, it } from 'vitest';
import {
  fastImportScript,
  formatPushStatus,
  handleHelperLine,
  listRefs,
  pushSrcRef,
  refuseNonFastForward,
  runRemoteHelper,
  shaForVersion,
} from './git-remote.js';
import { reconcilePush, remoteSlugFromArgv } from './git-remote-main.js';
import { unreconciledMessage, writeBase, writeGameFiles, readBase } from './checkout.js';
import { hashContent } from './checkout-sync.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { GIT_REMOTE_HELPER } from './bin-name.js';

describe('git-remote-gamedevpl', () => {
  it('advertises import and push and refuses non-ff like gamedevpl diff', () => {
    expect(handleHelperLine('capabilities', 'ghost-roads')).toContain('import');
    expect(handleHelperLine('capabilities', 'ghost-roads')).toContain('push');
    expect(refuseNonFastForward()).toContain(unreconciledMessage().slice(0, 20));
  });

  it('lists one commit per version and encodes a fast-import stream', () => {
    const versions = [
      { version: 'v-2', createdAt: '2026-08-02T00:00:00.000Z' },
      { version: 'v-1', createdAt: '2026-08-01T00:00:00.000Z' },
    ];
    const listed = listRefs(versions);
    expect(listed).toContain('@refs/heads/main HEAD');
    expect(listed).toContain('? refs/heads/main');
    expect(listed.some((line) => line.includes(shaForVersion('v-2')))).toBe(false);
    const script = fastImportScript({
      slug: 'ghost-roads',
      versions,
      trees: new Map([
        ['v-1', [{ path: 'game.ts', content: 'a' }]],
        ['v-2', [{ path: 'game.ts', content: 'b' }]],
      ]),
    });
    expect(script).toContain('commit refs/heads/main');
    expect(script).toContain('games/ghost-roads/game.ts');
    expect(script.match(/mark :\d+/g)?.length).toBe(2);
  });

  it('lists an unborn main ref when the remote has no versions', () => {
    expect(listRefs([])).toEqual(['@refs/heads/main HEAD', '? refs/heads/main', '']);
  });

  it('marks a successful push as delivered, not as a fake helper ok', async () => {
    const written: string[] = [];
    const seen: string[] = [];
    const lines = ['push refs/heads/main:refs/heads/main', ''];
    await runRemoteHelper('ghost-roads', {
      readLine: async () => lines.shift() ?? null,
      write: (line) => written.push(line),
      fetchVersions: async () => [],
      fetchTree: async () => [],
      importScript: async () => undefined,
      pushReconcile: async (src) => {
        seen.push(src);
        return { ok: true };
      },
    });
    expect(seen).toEqual(['refs/heads/main']);
    expect(written.join('')).toContain('ok refs/heads/main');
    expect(written.join('')).not.toMatch(/not a delivery path/);
  });

  it('reports a failed push as error dst why so Git rejects the ref', async () => {
    const written: string[] = [];
    const lines = ['push refs/heads/main:refs/heads/main', ''];
    await runRemoteHelper('ghost-roads', {
      readLine: async () => lines.shift() ?? null,
      write: (line) => written.push(line),
      fetchVersions: async () => [],
      fetchTree: async () => [],
      importScript: async () => undefined,
      pushReconcile: async () => ({ ok: false, message: 'verify failed at typecheck' }),
    });
    expect(written.join('')).toBe('error refs/heads/main verify failed at typecheck\n\n');
    expect(formatPushStatus('refs/heads/main', { ok: false, message: 'verify failed at typecheck' })).toBe(
      'error refs/heads/main verify failed at typecheck',
    );
  });

  it('makes git push fail when the helper reports error dst why', () => {
    const repo = mkdtempSync(join(tmpdir(), 'gdpl-git-push-'));
    const git = (args: string[]) => {
      const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || args.join(' '));
    };
    git(['init']);
    git(['config', 'user.email', 'cli@test']);
    git(['config', 'user.name', 'cli']);
    git(['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(repo, 'game.ts'), 'B');
    git(['add', '-A']);
    git(['commit', '-m', 'b']);
    const bin = join(repo, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, GIT_REMOTE_HELPER),
      `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
function write(s) { process.stdout.write(s); }
rl.on('line', (line) => {
  const t = String(line).trim();
  if (t === 'capabilities') { write('push\\noption\\n\\n'); return; }
  if (t === 'option' || t.startsWith('option ')) { write('ok\\n'); return; }
  if (t === 'list' || t.startsWith('list ')) { write('@refs/heads/main HEAD\\n? refs/heads/main\\n\\n'); return; }
  if (t.startsWith('push ')) {
    const dst = t.slice(5).split(':')[1] || 'refs/heads/main';
    write('error ' + dst + ' verify failed at typecheck\\n\\n');
  }
});
rl.on('close', () => process.exit(0));
`,
    );
    chmodSync(join(bin, GIT_REMOTE_HELPER), 0o755);
    git(['remote', 'add', 'origin', 'gamedevpl://ghost-roads']);
    const pushed = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/main'], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    });
    expect(pushed.status).not.toBe(0);
    const out = `${pushed.stdout}\n${pushed.stderr}`;
    expect(out).not.toMatch(/Everything up-to-date/i);
    expect(out).toMatch(/typecheck|rejected|error/i);
  });

  it('parses the push source ref from src:dst', () => {
    expect(pushSrcRef(['refs/heads/topic:refs/heads/main'])).toBe('refs/heads/topic');
    expect(pushSrcRef(['HEAD:refs/heads/main'])).toBe('HEAD');
    expect(pushSrcRef([])).toBeNull();
  });

  it('delivers the pushed commit, not uncommitted working-tree edits', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-push-'));
    const git = (args: string[]) => {
      const result = spawnSync('git', args, { cwd: dest, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || args.join(' '));
    };
    git(['init']);
    git(['config', 'user.email', 'cli@test']);
    git(['config', 'user.name', 'cli']);
    git(['config', 'commit.gpgsign', 'false']);
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'COMMITTED-B' }]);
    writeFileSync(join(dest, '.gamedev-slug'), 'ghost-roads');
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'COMMITTED-B' }]);
    git(['add', '-A']);
    git(['commit', '-m', 'b']);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'UNCOMMITTED-C');
    const seen: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response('{}', { status: 404 }),
    });
    const result = await reconcilePush({
      api,
      slug: 'ghost-roads',
      cwd: dest,
      srcRef: 'HEAD',
      submit: async ({ dest: isolated }) => {
        seen.push(readFileSync(join(isolated, 'games', 'ghost-roads', 'game.ts'), 'utf8'));
        expect(isolated).not.toBe(dest);
        return {
          kind: 'nothing',
          sync: { kind: 'clean', version: 'v1', local: [], platform: [], conflict: [] },
        };
      },
    });
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual(['COMMITTED-B']);
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('UNCOMMITTED-C');
  });

  it('adopts the delivered base in the original checkout after a successful push', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-push-'));
    const git = (args: string[]) => {
      const result = spawnSync('git', args, { cwd: dest, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || args.join(' '));
    };
    git(['init']);
    git(['config', 'user.email', 'cli@test']);
    git(['config', 'user.name', 'cli']);
    git(['config', 'commit.gpgsign', 'false']);
    writeGameFiles(dest, 'ghost-roads', [{ path: 'game.ts', content: 'COMMITTED-B' }]);
    writeFileSync(join(dest, '.gamedev-slug'), 'ghost-roads');
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    git(['add', '-A']);
    git(['commit', '-m', 'b']);
    writeFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'UNCOMMITTED-C');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response('{}', { status: 404 }),
    });
    const result = await reconcilePush({
      api,
      slug: 'ghost-roads',
      cwd: dest,
      srcRef: 'HEAD',
      submit: async ({ dest: isolated }) => ({
        kind: 'delivered',
        sync: { kind: 'local_only', version: 'v1', local: ['game.ts'], platform: [], conflict: [] },
        version: 'v2',
        mode: 'preview',
        gateStarted: true,
        staged: ['game.ts'],
        files: [{ path: 'game.ts', content: readFileSync(join(isolated, 'games', 'ghost-roads', 'game.ts'), 'utf8') }],
      }),
    });
    expect(result).toEqual({ ok: true });
    expect(readFileSync(join(dest, 'games', 'ghost-roads', 'game.ts'), 'utf8')).toBe('UNCOMMITTED-C');
    const base = readBase(dest);
    expect(base?.version).toBe('v2');
    expect(base?.files['game.ts']).toBe(hashContent('COMMITTED-B'));
    git(['add', '-A']);
    git(['commit', '-m', 'c']);
    let isolatedBase: ReturnType<typeof readBase> = null;
    let isolatedGame = '';
    const next = await reconcilePush({
      api,
      slug: 'ghost-roads',
      cwd: dest,
      srcRef: 'HEAD',
      submit: async ({ dest: isolated }) => {
        isolatedBase = readBase(isolated);
        isolatedGame = readFileSync(join(isolated, 'games', 'ghost-roads', 'game.ts'), 'utf8');
        return {
          kind: 'nothing',
          sync: { kind: 'local_only', version: 'v2', local: ['game.ts'], platform: [], conflict: [] },
        };
      },
    });
    expect(next).toEqual({ ok: true });
    expect(isolatedGame).toBe('UNCOMMITTED-C');
    expect(isolatedBase?.version).toBe('v2');
    expect(isolatedBase?.files['game.ts']).toBe(hashContent('COMMITTED-B'));
  });

  it('resolves no slug when the remote URL and checkout file are missing', () => {
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedevpl'], null)).toBe('');
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedevpl'], 'ghost-roads')).toBe('ghost-roads');
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedevpl', 'origin', 'gamedevpl://ghost-roads'], null)).toBe(
      'ghost-roads',
    );
  });
});
