import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'playwright-core';
import { BASE_URL, STORAGE_STATE_ENV } from './browser';

/**
 * Exchange the access token for a session cookie exactly once per run.
 *
 * `POST /api/auth/session` is rate limited to 20 per hour. Doing the exchange in each
 * test file's beforeAll spent one per file, so a suite of four files burned a fifth of
 * the hourly budget per run and locked itself out after five — and the lockout surfaces
 * as a 429 that reads exactly like an expired token. One exchange, shared by every
 * file, keeps the suite re-runnable while you iterate.
 *
 * The state lands in a temp file rather than an env var because it holds a live session
 * cookie: a temp file is removed in teardown, where an exported env var would be
 * inherited by every child process for the rest of the run.
 */
let directory: string | undefined;

export async function setup({ provide }: { provide: (key: string, value: unknown) => void }) {
  if (!process.env.GAMEDEV_ACCESS_TOKEN) return; // suites skip themselves; nothing to set up

  const api = await request.newContext({ baseURL: BASE_URL });
  try {
    const res = await api.post('/api/auth/session', {
      headers: { Authorization: `Bearer ${process.env.GAMEDEV_ACCESS_TOKEN}` },
    });

    if (res.status() === 429) {
      throw new Error(
        'token→session exchange rate limited (429). The limit is 20/hour and is shared with ' +
          'anything else using this token — wait it out rather than minting a second one.',
      );
    }
    if (res.status() !== 200) {
      throw new Error(
        `token→session exchange failed (${res.status()}). Likely expired or revoked — ` +
          'npm run token:list -w @gamedevpl/api -- bot:e2e',
      );
    }

    directory = await mkdtemp(join(tmpdir(), 'gamedev-e2e-'));
    const path = join(directory, 'storage-state.json');
    await writeFile(path, JSON.stringify(await api.storageState()), { mode: 0o600 });

    process.env[STORAGE_STATE_ENV] = path;
    provide(STORAGE_STATE_ENV, path);
  } finally {
    await api.dispose();
  }
}

export async function teardown() {
  if (directory) await rm(directory, { recursive: true, force: true });
}
