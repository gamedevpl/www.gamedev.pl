import { spawnSync } from 'node:child_process';
import { link, mkdir, mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveGateSandbox, scrubbedEnv, stripLinks } from './gate-sandbox.js';

describe('scrubbedEnv', () => {
  it('drops anything credential-shaped and keeps the toolchain env', () => {
    const env = scrubbedEnv(
      {
        PATH: '/usr/bin',
        GAMES_REPO_TOKEN: 'pat',
        GITHUB_TOKEN: 'pat',
        GATE_VERDICT_TOKEN: 'cap',
        GATE_VERDICT_URL: 'https://api.example',
        SUBMISSION_TOKEN_SECRET: 's',
        GOOGLE_APPLICATION_CREDENTIALS: '/key.json',
        SOME_API_KEY: 'k',
        GAME_CAPTURE_CHROME: '/usr/local/bin/gate-chrome',
        npm_config_cache: '/opt/npm-cache',
      },
      { HOME: '/tmp/gate-home' },
    );
    expect(env).toEqual({
      PATH: '/usr/bin',
      GAME_CAPTURE_CHROME: '/usr/local/bin/gate-chrome',
      npm_config_cache: '/opt/npm-cache',
      HOME: '/tmp/gate-home',
    });
  });
});

describe('stripLinks', () => {
  it('removes symlinks and hard links, leaves files, skips node_modules', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'strip-'));
    await mkdir(path.join(root, 'games/g/media'), { recursive: true });
    await mkdir(path.join(root, 'node_modules/pkg'), { recursive: true });
    await writeFile(path.join(root, 'games/g/game.ts'), 'ok');
    await writeFile(path.join(root, 'outside'), 'x');
    await symlink('/etc/hostname', path.join(root, 'games/g/media/shot.png'));
    await link(path.join(root, 'outside'), path.join(root, 'games/g/hard.json'));
    await symlink('/etc', path.join(root, 'games/g/dir-link'));
    await symlink('/etc/hostname', path.join(root, 'node_modules/pkg/link'));

    const removed = await stripLinks(path.join(root, 'games'));

    expect(removed.sort()).toEqual(['g/dir-link', 'g/hard.json', 'g/media/shot.png']);
    expect((await readdir(path.join(root, 'games/g'))).sort()).toEqual(['game.ts', 'media']);
    expect(await readdir(path.join(root, 'node_modules/pkg'))).toEqual(['link']);
  });
});

describe('resolveGateSandbox', () => {
  it('is off when no user is configured', async () => {
    expect(await resolveGateSandbox('')).toBeNull();
  });

  // Only meaningful as root, as in Cloud Build.
  it.skipIf(process.getuid?.() !== 0)('runs as a user that cannot read the runner environment', async () => {
    const sandbox = await resolveGateSandbox('nobody');
    expect(sandbox).not.toBeNull();
    const read = spawnSync('cat', [`/proc/${process.pid}/environ`], { uid: sandbox!.uid, gid: sandbox!.gid });
    expect(read.status).not.toBe(0);
    await sandbox!.dispose();
  });
});
