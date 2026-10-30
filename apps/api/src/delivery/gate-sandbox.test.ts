import { spawnSync } from 'node:child_process';
import { link, mkdir, mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHarnessRunner, resolveGateSandbox, scrubbedEnv, stripLinks } from './gate-sandbox.js';

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

describe('createHarnessRunner', () => {
  it('refuses to run candidate code unsandboxed when the metadata block is required', async () => {
    const saved = { user: process.env.GATE_SANDBOX_USER, require: process.env.GATE_REQUIRE_METADATA_BLOCK };
    delete process.env.GATE_SANDBOX_USER;
    process.env.GATE_REQUIRE_METADATA_BLOCK = '1';
    try {
      await expect(createHarnessRunner(async () => ({ code: 0, output: '' }), [])).rejects.toThrow(
        /GATE_REQUIRE_METADATA_BLOCK=1/,
      );
    } finally {
      if (saved.user === undefined) delete process.env.GATE_SANDBOX_USER;
      else process.env.GATE_SANDBOX_USER = saved.user;
      if (saved.require === undefined) delete process.env.GATE_REQUIRE_METADATA_BLOCK;
      else process.env.GATE_REQUIRE_METADATA_BLOCK = saved.require;
    }
  });

  it('forwards the delivery slug to harness commands', async () => {
    const saved = { user: process.env.GATE_SANDBOX_USER, require: process.env.GATE_REQUIRE_METADATA_BLOCK };
    delete process.env.GATE_SANDBOX_USER;
    delete process.env.GATE_REQUIRE_METADATA_BLOCK;
    try {
      let seen: NodeJS.ProcessEnv | undefined;
      const { runInHarness } = await createHarnessRunner(
        async (_command, _args, _cwd, options) => {
          seen = options?.env;
          return { code: 0, output: '' };
        },
        [],
        { GATE_DELIVERY_SLUG: 'airtime' },
      );
      await runInHarness('npm', ['run', 'check:game', '--', 'airtime'], '/tmp');
      expect(seen?.GATE_DELIVERY_SLUG).toBe('airtime');
    } finally {
      if (saved.user === undefined) delete process.env.GATE_SANDBOX_USER;
      else process.env.GATE_SANDBOX_USER = saved.user;
      if (saved.require === undefined) delete process.env.GATE_REQUIRE_METADATA_BLOCK;
      else process.env.GATE_REQUIRE_METADATA_BLOCK = saved.require;
    }
  });
});
