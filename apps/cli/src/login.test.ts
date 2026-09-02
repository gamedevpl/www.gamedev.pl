import { request as httpRequest } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { EXIT_AUTH, EXIT_GREEN, EXIT_INPUT } from './exit-codes.js';
import { encryptedFileStore, memoryStore } from './keychain.js';
import { runLoopbackLogin } from './login.js';
import { runCli } from './main.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth.js';

function sink() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = '';
  let err = '';
  stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
  });
  stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString();
  });
  return {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    read: () => ({ out, err }),
  };
}

describe('loopback login', () => {
  it('opens the authorize URL, exchanges the code, and stores tokens', async () => {
    const store = memoryStore();
    const io = sink();
    let tokenBody = '';
    await runLoopbackLogin({
      origin: 'https://www.gamedev.pl',
      store,
      stdout: io.stdout,
      stderr: io.stderr,
      timeoutMs: 4000,
      fetch: async (url, init) => {
        expect(String(url)).toBe('https://www.gamedev.pl/oauth/token');
        tokenBody = String(init?.body ?? '');
        return new Response(
          JSON.stringify({
            access_token: 'gdpl_oat_loop',
            refresh_token: 'gdpl_ort_loop',
            token_type: 'Bearer',
            scope: 'creator',
          }),
          { status: 200 },
        );
      },
      openUrl: async (url) => {
        const parsed = new URL(url);
        expect(parsed.searchParams.get('client_id')).toBe(GAMEDEV_CLI_CLIENT_ID);
        expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
        const redirect = parsed.searchParams.get('redirect_uri');
        const state = parsed.searchParams.get('state');
        expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
        const hit = await fetch(`${redirect}?code=auth-code-1&state=${state}`);
        expect(hit.status).toBe(200);
        expect(await hit.text()).toContain('Signed in');
        return true;
      },
    });
    expect(io.read().out).toContain('opening the browser to sign in');
    expect(io.read().out).toContain('signed in');
    expect(io.read().out).not.toContain('/oauth/authorize');
    expect(tokenBody).toContain('grant_type=authorization_code');
    expect(tokenBody).toContain('code=auth-code-1');
    expect(tokenBody).toContain('code_verifier=');
    const saved = await store.get();
    expect(saved?.accessToken).toBe('gdpl_oat_loop');
    expect(saved?.refreshToken).toBe('gdpl_ort_loop');
  });

  it('treats access_denied as a cancelled sign-in', async () => {
    const store = memoryStore();
    const io = sink();
    await expect(
      runLoopbackLogin({
        origin: 'https://www.gamedev.pl',
        store,
        stdout: io.stdout,
        timeoutMs: 4000,
        fetch: async () => new Response('{}', { status: 500 }),
        openUrl: async (url) => {
          const parsed = new URL(url);
          const redirect = parsed.searchParams.get('redirect_uri');
          const state = parsed.searchParams.get('state');
          await fetch(`${redirect}?error=access_denied&state=${state}`);
          return true;
        },
      }),
    ).rejects.toMatchObject({ message: 'sign-in cancelled', exitCode: EXIT_AUTH });
    expect(await store.get()).toBeNull();
  });

  it('surfaces non-cancel OAuth errors instead of calling them cancelled', async () => {
    const store = memoryStore();
    const io = sink();
    await expect(
      runLoopbackLogin({
        origin: 'https://www.gamedev.pl',
        store,
        stdout: io.stdout,
        timeoutMs: 4000,
        fetch: async () => new Response('{}', { status: 500 }),
        openUrl: async (url) => {
          const parsed = new URL(url);
          const redirect = parsed.searchParams.get('redirect_uri');
          const state = parsed.searchParams.get('state');
          const hit = await fetch(`${redirect}?error=invalid_request&state=${state}`);
          expect(hit.status).toBe(200);
          expect(await hit.text()).toContain('Sign-in failed');
          return true;
        },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('invalid_request'), exitCode: EXIT_AUTH });
    expect(await store.get()).toBeNull();
  });

  it('prints the URL when the browser cannot be opened', async () => {
    const store = memoryStore();
    const io = sink();
    await runLoopbackLogin({
      origin: 'https://www.gamedev.pl',
      store,
      stdout: io.stdout,
      timeoutMs: 4000,
      fetch: async () =>
        new Response(JSON.stringify({ access_token: 'gdpl_oat_x', token_type: 'Bearer', scope: 'creator' }), {
          status: 200,
        }),
      openUrl: async (url) => {
        const parsed = new URL(url);
        await fetch(`${parsed.searchParams.get('redirect_uri')}?code=c&state=${parsed.searchParams.get('state')}`);
        return false;
      },
    });
    expect(io.read().out).toMatch(/^open https:\/\/www\.gamedev\.pl\/oauth\/authorize/m);
  });

  it('parses the callback against a fixed loopback origin, not Host', async () => {
    const store = memoryStore();
    const io = sink();
    await runLoopbackLogin({
      origin: 'https://www.gamedev.pl',
      store,
      stdout: io.stdout,
      timeoutMs: 4000,
      fetch: async () =>
        new Response(JSON.stringify({ access_token: 'gdpl_oat_host', token_type: 'Bearer', scope: 'creator' }), {
          status: 200,
        }),
      openUrl: async (url) => {
        const parsed = new URL(url);
        const redirect = new URL(parsed.searchParams.get('redirect_uri') ?? '');
        const state = parsed.searchParams.get('state');
        await new Promise<void>((resolve, reject) => {
          const req = httpRequest(
            {
              hostname: redirect.hostname,
              port: redirect.port,
              path: `${redirect.pathname}?code=c&state=${state}`,
              headers: { host: '::::' },
            },
            (res) => {
              res.resume();
              res.on('end', resolve);
            },
          );
          req.on('error', reject);
          req.end();
        });
        return true;
      },
    });
    expect((await store.get())?.accessToken).toBe('gdpl_oat_host');
  });
});

describe('login verb', () => {
  it('imports GAMEDEV_TOKEN into the encrypted store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedevpl-login-'));
    const path = join(dir, 'credentials.bin');
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = false;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let out = '';
    let err = '';
    stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    const code = await runCli(
      ['node', 'gamedevpl', 'login'],
      { HOME: dir, GAMEDEV_TOKEN: 'gdpl_pat_import', GAMEDEV_TOKEN_FILE: path },
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
      },
    );
    expect(code).toBe(EXIT_GREEN);
    expect(out).toContain('signed in with GAMEDEV_TOKEN');
    expect(err.match(/WARNING: tokens stored/g) ?? []).toHaveLength(1);
    const stored = await encryptedFileStore({ HOME: dir, GAMEDEV_TOKEN_FILE: path }).get();
    expect(stored?.accessToken).toBe('gdpl_pat_import');
  });

  it('imports --token the same way', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedevpl-login-'));
    const path = join(dir, 'credentials.bin');
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = false;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let out = '';
    let err = '';
    stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    const code = await runCli(
      ['node', 'gamedevpl', 'login', '--token', 'gdpl_pat_flag'],
      { HOME: dir, GAMEDEV_TOKEN_FILE: path },
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
      },
    );
    expect(code).toBe(EXIT_GREEN);
    expect(out).toContain('signed in with --token');
    expect(out).not.toContain('GAMEDEV_TOKEN');
    expect(err.match(/WARNING: tokens stored/g) ?? []).toHaveLength(1);
    const stored = await encryptedFileStore({ HOME: dir, GAMEDEV_TOKEN_FILE: path }).get();
    expect(stored?.accessToken).toBe('gdpl_pat_flag');
  });

  it('refuses a pipe without a token', async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = false;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let err = '';
    stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    const code = await runCli(
      ['node', 'gamedevpl', 'login'],
      { HOME: mkdtempSync(join(tmpdir(), 'gamedevpl-login-')) },
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: stderr as unknown as NodeJS.WriteStream,
      },
    );
    expect(code).toBe(EXIT_INPUT);
    expect(err).toContain('GAMEDEV_TOKEN');
  });
});
