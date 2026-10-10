import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { npmCliProject, updateProjectCli } from './update-project.js';

const endpoint = vi.hoisted(() => ({ origin: '' }));
vi.mock('./update.js', async (original) => ({
  ...(await original<typeof import('./update.js')>()),
  releaseUrl: (version: string, file: string) => `${endpoint.origin}/${version}/${file}`,
}));
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-project-update-'));
  roots.push(root);
  return root;
}

it('finds the project from a game subdirectory without targeting an unrelated parent package', () => {
  const root = temporary();
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { '@gamedevpl/cli': 'old' } }));
  mkdirSync(join(root, 'games', 'robot'), { recursive: true });
  expect(npmCliProject(join(root, 'games', 'robot'))).toBe(root);
  writeFileSync(join(root, 'games', 'package.json'), '{}');
  expect(npmCliProject(join(root, 'games', 'robot'))).toBeUndefined();
});

it('updates the real npm package, lock and executable while preserving game files and skipping scripts', async () => {
  const root = temporary();
  const packageRoot = join(root, 'fixture');
  mkdirSync(packageRoot);
  writeFileSync(
    join(packageRoot, 'package.json'),
    JSON.stringify({
      name: '@gamedevpl/cli',
      version: '9.0.0',
      bin: { gamedevpl: 'cli.cjs' },
      scripts: { postinstall: 'touch package-script-ran' },
    }),
  );
  writeFileSync(join(packageRoot, 'cli.cjs'), '#!/usr/bin/env node\nconsole.log("gamedevpl 9.0.0");');
  const archive = join(root, 'cli.tgz');
  execFileSync('tar', ['-czf', archive, '-C', root, '--transform=s/^fixture/package/', 'fixture']);
  const bytes = readFileSync(archive);
  const server = createServer((req, res) => {
    res.end(
      req.url?.endsWith('SHA256SUMS')
        ? `${createHash('sha256').update(bytes).digest('hex')}  gamedevpl-npm.tgz\n`
        : bytes,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint.origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const project = join(root, 'game');
  mkdirSync(project);
  const manifest = {
    name: 'my-game',
    version: '1.0.0',
    devDependencies: { '@gamedevpl/cli': endpoint.origin + '/old.tgz' },
    scripts: { prepare: 'touch project-script-ran' },
  };
  writeFileSync(join(project, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(project, 'game.ts'), 'const game = "preserved";');
  const messages: string[] = [];
  try {
    const result = await updateProjectCli({
      root: project,
      version: '9.0.0',
      env: { ...process.env, npm_config_cache: join(root, 'cache') },
      onProgress: (line) => messages.push(line),
    });
    expect(result).toEqual({ version: '9.0.0' });
    expect(
      execFileSync(process.execPath, [join(project, 'node_modules/@gamedevpl/cli/cli.cjs')], { encoding: 'utf8' }),
    ).toBe('gamedevpl 9.0.0\n');
    expect(readFileSync(join(project, 'game.ts'), 'utf8')).toBe('const game = "preserved";');
    const lock = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8'));
    expect(lock.packages['node_modules/@gamedevpl/cli'].integrity).toBe(
      `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    );
    expect(JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')).scripts).toEqual(manifest.scripts);
    expect(messages).toContain('Installing verified project CLI…');
    expect(() => readFileSync(join(project, 'project-script-ran'))).toThrow();
    expect(() => readFileSync(join(project, 'node_modules/@gamedevpl/cli/package-script-ran'))).toThrow();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 20_000);

it('rejects tampered archives before changing the project', async () => {
  const root = temporary();
  writeFileSync(join(root, 'package.json'), '{"devDependencies":{"@gamedevpl/cli":"old"}}');
  await expect(
    updateProjectCli({
      root,
      version: '9.0.0',
      fetchImpl: async (url) =>
        new Response(url.endsWith('SHA256SUMS') ? `${'a'.repeat(64)}  gamedevpl-npm.tgz` : 'tampered'),
    }),
  ).rejects.toThrow('checksum mismatch');
  expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"old"');
});

it('gives a retry action when a project download stalls', async () => {
  const root = temporary();
  writeFileSync(join(root, 'package.json'), '{"devDependencies":{"@gamedevpl/cli":"old"}}');
  await expect(
    updateProjectCli({
      root,
      version: '9.0.0',
      timeoutMs: 30,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
        }),
    }),
  ).rejects.toMatchObject({
    message: 'Project CLI update timed out.',
    next: expect.stringContaining('retry gamedevpl update'),
  });
  expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"old"');
});
