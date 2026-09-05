import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { isLaunchedEntry, isGitRemoteHelper, runCli } from './main.js';
import { EXIT_AUTH, EXIT_GREEN, EXIT_INPUT } from './exit-codes.js';

function io() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = false;
  let out = '';
  let err = '';
  stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
  });
  stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString();
  });
  return {
    stdin,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    read: () => ({ out, err }),
  };
}

describe('runCli verbs', () => {
  it('writes the file-store warning to injected stderr', async () => {
    const streams = io();
    expect(
      await runCli(
        ['node', 'gamedevpl', 'help'],
        { GAMEDEV_ALLOW_FILE_KEYCHAIN: 'true', HOME: '/tmp/gamedev-cli-empty' },
        streams,
      ),
    ).toBe(EXIT_GREEN);
    expect(streams.read().err).toMatch(/encrypted file/);
  });

  it('prints a described verb list for --help', async () => {
    const streams = io();
    expect(await runCli(['node', 'gamedevpl', '--help'], { HOME: '/tmp/gamedev-cli-empty' }, streams)).toBe(EXIT_GREEN);
    const out = streams.read().out;
    expect(out).toContain('open a browser and sign in');
    expect(out).not.toMatch(/gamedevpl <[a-z]+\|/);
  });

  it('exits 4 when repl is run without a TTY', async () => {
    const streams = io();
    expect(await runCli(['node', 'gamedevpl'], {}, streams)).toBe(EXIT_INPUT);
  });

  it('exits 4 when repl stdout is redirected', async () => {
    const streams = io();
    streams.stdin.isTTY = true;
    expect(await runCli(['node', 'gamedevpl'], {}, streams)).toBe(EXIT_INPUT);
    expect(streams.read().err).toMatch(/non-TTY/);
  });

  it('exits 3 when whoami has no credential', async () => {
    const streams = io();
    expect(await runCli(['node', 'gamedevpl', 'whoami'], { HOME: '/tmp/gamedev-cli-empty' }, streams)).toBe(EXIT_AUTH);
  });

  it('diff --force still needs a slug', async () => {
    const streams = io();
    expect(await runCli(['node', 'gamedevpl', 'diff', '--force'], { HOME: '/tmp/gamedev-cli-empty' }, streams)).toBe(
      EXIT_INPUT,
    );
  });

  it('exits 4 when diff has no slug and no checkout', async () => {
    const streams = io();
    expect(await runCli(['node', 'gamedevpl', 'diff'], { HOME: '/tmp/gamedev-cli-empty' }, streams)).toBe(EXIT_INPUT);
  });

  it('treats the installed script name as a direct launch', () => {
    const dest = '/home/me/.local/bin/gamedevpl';
    expect(isLaunchedEntry(dest, pathToFileURL(dest).href)).toBe(true);
    expect(isLaunchedEntry(dest, pathToFileURL('/tmp/vitest').href)).toBe(false);
    expect(isLaunchedEntry(undefined)).toBe(false);
  });

  it('stops status --watch after a terminal published read', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: 'published', slug: 'sky-dodge' }), { status: 200 });
    });
    const streams = io();
    expect(
      await runCli(['node', 'gamedevpl', 'status', 'tok', '--watch'], { GAMEDEV_TOKEN: 'gdpl_pat_x' }, streams),
    ).toBe(EXIT_GREEN);
    expect(calls).toBe(1);
    expect(streams.read().out).toContain('published');
    vi.unstubAllGlobals();
  });

  it('treats a gamedevpl:// URL as the git remote helper even when argv1 is gamedevpl', () => {
    expect(isGitRemoteHelper(['node', '/bin/gamedevpl', 'origin', 'gamedevpl://sky-dodge'])).toBe(true);
    expect(isGitRemoteHelper(['node', '/bin/gamedevpl', 'status', 'tok'])).toBe(false);
    expect(isGitRemoteHelper(['node', '/bin/gamedevpl', 'connect', 'gamedevpl://sky-dodge'])).toBe(false);
    expect(isGitRemoteHelper(['node', '/bin/git-remote-gamedevpl', 'origin', 'gamedevpl://sky-dodge'])).toBe(true);
  });
});
