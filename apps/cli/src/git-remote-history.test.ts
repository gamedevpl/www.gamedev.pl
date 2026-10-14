import { afterEach, describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(scope?: string, objectFormat = 'sha1') {
  const dir = mkdtempSync(join(tmpdir(), 'gamedev-history-test-'));
  dirs.push(dir);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const module = join(dir, 'helper.cjs');
  buildSync({
    entryPoints: [
      fileURLToPath(new URL('./git-remote.ts', import.meta.url)),
      fileURLToPath(new URL('./git-history-cache.ts', import.meta.url)),
    ],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: join(dir, 'modules'),
  });
  writeFileSync(
    module,
    `module.exports = {...require('./modules/git-remote.js'), ...require('./modules/git-history-cache.js')};`,
  );
  const data = join(dir, 'fixture.json');
  const reads = join(dir, 'reads.jsonl');
  const helper = join(bin, 'git-remote-gamedevpl');
  writeFileSync(
    helper,
    `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const { readFileSync, appendFileSync } = require('node:fs');
const { runRemoteHelper, knownHistoryCommits } = require(${JSON.stringify(module)});
const rl = createInterface({input: process.stdin, crlfDelay: Infinity});
const iterator = rl[Symbol.asyncIterator]();
const data = JSON.parse(readFileSync(${JSON.stringify(data)}, 'utf8'));
runRemoteHelper('probe', {
 readLine: async () => { const line = await iterator.next(); return line.done ? null : line.value; },
 write: text => process.stdout.write(text),
 fetchVersions: async () => data.versions,
 fetchTree: async (_, version) => { appendFileSync(${JSON.stringify(reads)}, version + '\\n'); return data.trees[version]; },
 knownCommits: () => knownHistoryCommits('probe', process.cwd(), ${JSON.stringify(scope) ?? 'undefined'}),
 scope: ${JSON.stringify(scope) ?? 'undefined'},
 importScript: async bytes => { process.stdout.write(bytes); },
 pushReconcile: async () => ({ok: false, message: 'read-only fixture'})
}).then(() => rl.close()).catch(error => { console.error(error); process.exit(1); });
`,
  );
  chmodSync(helper, 0o755);
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  const env = {
    ...process.env,
    PATH: bin + delimiter + process.env.PATH,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  };
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: repo, env, encoding: 'utf8', timeout: 10_000 });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const versions = [1, 2].map((n) => ({ version: `v${n}`, createdAt: `2026-10-0${n}T00:00:00Z` }));
  const image = Buffer.from([0, 255, 128, 10, 13]);
  const trees: Record<string, Array<{ path: string; content: string; encoding?: 'base64' }>> = {
    v1: [{ path: 'game.ts', content: 'const a = 1;\nconst b = 2;\n' }],
    v2: [
      { path: 'game.ts', content: 'const a = 1;\nconst b = 3;\n' },
      { path: 'media/image.png', content: image.toString('base64'), encoding: 'base64' },
    ],
  };
  const save = () => writeFileSync(data, JSON.stringify({ versions, trees }));
  save();
  git('init', '-b', 'main', `--object-format=${objectFormat}`);
  git('config', 'user.name', 'local creator');
  git('config', 'user.email', 'local@example.invalid');
  git('remote', 'add', 'origin', 'gamedevpl://probe');
  return { dir, repo, git, versions, trees, save, reads, image };
}

describe('real Git history through the remote helper', () => {
  it.each(['sha1', 'sha256'])('preserves local work and imports incrementally in a %s repository', (format) => {
    const f = fixture('abcd1234abcd1234', format);
    writeFileSync(join(f.repo, 'local.txt'), 'local committed file');
    f.git('add', '.');
    f.git('-c', 'commit.gpgsign=false', 'commit', '-m', 'local history');
    const head = f.git('rev-parse', 'HEAD');
    writeFileSync(join(f.repo, 'local.txt'), 'unsent edit');
    const status = f.git('status', '--porcelain');
    f.git('fetch', 'origin');
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(f.git('status', '--porcelain')).toBe(status);
    expect(readFileSync(join(f.repo, 'local.txt'), 'utf8')).toBe('unsent edit');
    expect(f.git('log', 'origin/main', '--format=%s')).toBe('v2\nv1');
    expect(f.git('rev-list', '--parents', 'origin/main~1')).not.toContain(' ');
    const before = f.git('rev-parse', 'origin/main');
    const blame = f.git('blame', '--line-porcelain', 'origin/main', '--', 'games/probe/game.ts');
    expect(blame).toContain('summary v1');
    expect(blame).toContain('summary v2');
    f.git('fetch', 'origin');
    expect(f.git('rev-parse', 'origin/main')).toBe(before);
    expect(readFileSync(f.reads, 'utf8').trim().split('\n')).toHaveLength(2);
    f.versions.push({ version: 'v3', createdAt: '2026-10-03T00:00:00Z' });
    f.trees.v3 = [{ path: 'game.ts', content: 'const a = 4;\nconst b = 3;\n' }];
    f.save();
    f.git('fetch', 'origin');
    expect(f.git('log', 'origin/main', '--format=%s')).toBe('v3\nv2\nv1');
    expect(f.git('rev-parse', 'origin/main^')).toBe(before);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(readFileSync(f.reads, 'utf8').trim().split('\n')).toHaveLength(3);
    const imported = spawnSync('git', ['show', 'origin/main^:games/probe/media/image.png'], { cwd: f.repo });
    expect(imported.stdout).toEqual(f.image);
    const latest = f.git('rev-parse', 'origin/main');
    for (const row of f.versions) {
      f.git(
        'update-ref',
        '-d',
        `refs/gamedevpl/abcd1234abcd1234/probe/versions/${Buffer.from(row.version).toString('hex')}`,
      );
    }
    f.git('fetch', 'origin');
    expect(f.git('rev-parse', 'origin/main')).toBe(latest);
    expect(f.git('log', 'origin/main', '--format=%s')).toBe('v3\nv2\nv1');
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
  });

  it('accepts an empty history', () => {
    const f = fixture();
    f.versions.length = 0;
    f.save();
    f.git('fetch', 'origin');
    expect(f.git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin')).toBe('');
  });
});
