import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createApi } from './api.js';
import { encryptedFileStore } from './keychain.js';

const directories: string[] = [];
function directory() {
  const dir = mkdtempSync(join(tmpdir(), 'gdpl-refresh-race-'));
  directories.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('coordinates two API clients sharing an expired credential file', async () => {
  const dir = directory();
  const env = { HOME: dir, GAMEDEV_TOKEN_FILE: join(dir, 'credentials.bin') };
  const firstStore = encryptedFileStore(env);
  await firstStore.set({ accessToken: 'old', refreshToken: 'refresh-1', tokenType: 'Bearer', scope: 'creator' });
  let refreshes = 0;
  let revoked = false;
  let currentRefresh = 'refresh-1';
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/oauth/token')) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const refresh = new URLSearchParams(String(init?.body)).get('refresh_token');
      if (refresh !== currentRefresh || revoked) {
        revoked = true;
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      currentRefresh = 'refresh-2';
      return Response.json({
        access_token: 'new',
        refresh_token: currentRefresh,
        token_type: 'Bearer',
        scope: 'creator',
      });
    }
    const access = (init?.headers as Record<string, string>).authorization;
    return access === 'Bearer new' && !revoked ? Response.json({ ok: true }) : Response.json({}, { status: 401 });
  };
  const apiA = createApi({ origin: 'https://example.test', store: firstStore, fetch: fetchImpl, env: {} });
  const apiB = createApi({ origin: 'https://example.test', store: encryptedFileStore(env), fetch: fetchImpl, env: {} });
  const results = await Promise.allSettled([apiA.request('GET', '/profile'), apiB.request('GET', '/status')]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
  expect(revoked).toBe(false);
  expect(refreshes).toBe(1);
});

it('shares one refresh between separate terminal and Play processes', async () => {
  const dir = directory();
  const env = { ...process.env, HOME: dir, GAMEDEV_TOKEN_FILE: join(dir, 'credentials.bin') };
  await encryptedFileStore(env).set({
    accessToken: 'old',
    refreshToken: 'refresh-1',
    tokenType: 'Bearer',
    scope: 'creator',
  });
  const worker = join(dir, 'client.mjs');
  await build({
    stdin: {
      contents: `import { createApi } from './api.js'; import { encryptedFileStore } from './keychain.js';
      await createApi({ origin: process.argv[2], store: encryptedFileStore(), env: {} }).request('GET', '/status');`,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'ts',
    },
    outfile: worker,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
  });
  const expired: Array<() => void> = [];
  let refreshes = 0;
  let revoked = false;
  const server = createServer(async (req, res) => {
    const reply = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/oauth/token') {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (refreshes > 1 || new URLSearchParams(body).get('refresh_token') !== 'refresh-1') {
        revoked = true;
        reply({ error: 'invalid_grant' }, 400);
      } else reply({ access_token: 'new', refresh_token: 'refresh-2', token_type: 'Bearer', scope: 'creator' });
    } else if (req.headers.authorization === 'Bearer old') {
      expired.push(() => reply({}, 401));
      if (expired.length === 2) for (const finish of expired) finish();
    } else reply({ ok: true }, revoked ? 401 : 200);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no test listener');
  const children = Array.from({ length: 2 }, () =>
    spawn(process.execPath, [worker, `http://127.0.0.1:${address.port}`], { env, stdio: ['ignore', 'pipe', 'pipe'] }),
  );
  try {
    const results = await Promise.all(
      children.map(
        (child) =>
          new Promise<{ code: number | null; error: string }>((resolve, reject) => {
            let error = '';
            child.stderr.on('data', (chunk) => {
              error += String(chunk);
            });
            child.once('error', reject);
            child.once('exit', (code) => resolve({ code, error }));
          }),
      ),
    );
    expect(results).toEqual([
      { code: 0, error: '' },
      { code: 0, error: '' },
    ]);
    expect(refreshes).toBe(1);
    expect(revoked).toBe(false);
    expect((await encryptedFileStore(env).get())?.refreshToken).toBe('refresh-2');
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
