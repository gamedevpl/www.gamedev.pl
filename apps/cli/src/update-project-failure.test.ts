import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { spawnCommand } from './delegate.js';
import { releaseUrl } from './update.js';
import { updateProjectCli } from './update-project.js';

vi.mock('./delegate.js', async (original) => ({
  ...(await original<typeof import('./delegate.js')>()),
  spawnCommand: vi.fn(),
}));
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

it.each(['install', 'verify'])(
  'restores metadata, the old executable and bin links after %s fails',
  async (failure) => {
    const root = mkdtempSync(join(tmpdir(), 'gdpl-update-rollback-'));
    roots.push(root);
    const packageRoot = join(root, 'node_modules/@gamedevpl/cli');
    mkdirSync(packageRoot, { recursive: true });
    mkdirSync(join(root, 'node_modules/.bin'));
    writeFileSync(join(root, 'package.json'), '{"devDependencies":{"@gamedevpl/cli":"old"}}');
    writeFileSync(join(root, 'package-lock.json'), '{"old":"lock"}');
    writeFileSync(join(root, 'node_modules/.package-lock.json'), '{"old":"installed"}');
    writeFileSync(join(packageRoot, 'package.json'), '{"name":"@gamedevpl/cli","version":"0.1.0"}');
    writeFileSync(join(packageRoot, 'cli.cjs'), 'old CLI');
    symlinkSync('../@gamedevpl/cli/cli.cjs', join(root, 'node_modules/.bin/gamedevpl'));
    const bytes = Buffer.from('verified archive');
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    vi.mocked(spawnCommand).mockImplementation((input) => {
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
      queueMicrotask(() => {
        writeFileSync(join(root, 'package.json'), '{"devDependencies":{"@gamedevpl/cli":"new"}}');
        writeFileSync(
          join(root, 'package-lock.json'),
          JSON.stringify({
            packages: {
              'node_modules/@gamedevpl/cli': {
                version: '9.0.0',
                resolved: releaseUrl('9.0.0', 'gamedevpl-npm.tgz'),
                integrity,
              },
            },
          }),
        );
        const install = !input.args.includes('--package-lock-only');
        if (install) {
          writeFileSync(join(packageRoot, 'cli.cjs'), 'partially installed CLI');
          writeFileSync(join(root, 'node_modules/.package-lock.json'), '{}');
        }
        child.emit('close', install && failure === 'install' ? 1 : 0);
      });
      return child as unknown as ReturnType<typeof spawnCommand>;
    });
    await expect(
      updateProjectCli({
        root,
        version: '9.0.0',
        fetchImpl: async (url) =>
          new Response(
            url.endsWith('SHA256SUMS')
              ? `${createHash('sha256').update(bytes).digest('hex')}  gamedevpl-npm.tgz`
              : bytes,
          ),
      }),
    ).rejects.toThrow(failure === 'install' ? 'update failed' : 'does not match');
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"old"');
    expect(readFileSync(join(root, 'package-lock.json'), 'utf8')).toBe('{"old":"lock"}');
    expect(readFileSync(join(root, 'node_modules/.package-lock.json'), 'utf8')).toContain('installed');
    expect(readFileSync(join(root, 'node_modules/.bin/gamedevpl'), 'utf8')).toBe('old CLI');
    expect(existsSync(join(packageRoot, 'cli.cjs'))).toBe(true);
  },
);
