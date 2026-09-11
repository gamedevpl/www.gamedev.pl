#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApi, type ApiClient } from './api.js';
import { encryptedFileStore, memoryStore } from './keychain.js';
import { originFromEnv } from './oauth.js';
import { describeError } from './errors.js';
import { submitGame, type SubmitResult } from './submit.js';
import { runRemoteHelper, type PushResult } from './git-remote.js';
import { materializePushCheckout } from './git-ref.js';
import { GIT_REMOTE_SCHEME } from './bin-name.js';
import { localGameFiles, writeBase } from './checkout.js';

function slugFromUrl(url: string): string {
  const prefix = `${GIT_REMOTE_SCHEME}://`;
  const stripped = url.startsWith(prefix) ? url.slice(prefix.length) : url;
  return stripped.replace(/\/$/, '');
}

export function remoteSlugFromArgv(argv: string[], cwdSlug: string | null): string {
  return slugFromUrl(argv[3] ?? argv[2] ?? cwdSlug ?? '');
}

function storeFromEnv(env: NodeJS.ProcessEnv) {
  if (env.GAMEDEV_TOKEN) {
    return memoryStore({ accessToken: env.GAMEDEV_TOKEN, tokenType: 'Bearer', scope: 'creator' });
  }
  return encryptedFileStore(env);
}

function readSlugFile(cwd: string): string | null {
  const path = join(cwd, '.gamedev-slug');
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null;
}

function adoptCheckoutBase(cwd: string, slug: string, dest: string, result: SubmitResult): void {
  if (result.kind === 'delivered') writeBase(cwd, result.version, result.files);
  else writeBase(cwd, result.sync.version, localGameFiles(dest, slug));
}

export async function reconcilePush(input: {
  api: ApiClient;
  slug: string;
  cwd: string;
  srcRef: string;
  submit?: typeof submitGame;
}): Promise<PushResult> {
  const tmp = mkdtempSync(join(tmpdir(), 'gamedev-push-'));
  try {
    const dest = materializePushCheckout({
      repo: input.cwd,
      srcRef: input.srcRef,
      slug: input.slug,
      cwd: input.cwd,
      dest: tmp,
    });
    const result = await (input.submit ?? submitGame)({ api: input.api, slug: input.slug, dest });
    adoptCheckoutBase(input.cwd, input.slug, dest, result);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeError(error).message };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function runGitRemoteHelper(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const slug = remoteSlugFromArgv(argv, readSlugFile(process.cwd()));
  if (!slug) {
    stdout.write('error missing game slug\n');
    return 1;
  }
  const api = createApi({ origin: originFromEnv(env), store: storeFromEnv(env), env });
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });
  try {
    const iter = rl[Symbol.asyncIterator]();
    await runRemoteHelper(slug, {
      readLine: async () => {
        const next = await iter.next();
        return next.done ? null : String(next.value);
      },
      write: (line) => stdout.write(line.endsWith('\n') ? line : `${line}\n`),
      fetchVersions: async (game) => {
        const body = await api.request<{ versions: Array<{ version: string; createdAt: string }> }>(
          'GET',
          `/api/me/studio/games/${game}/versions`,
        );
        return body.versions;
      },
      fetchTree: async (game, version) => {
        const body = await api.request<{ files: Array<{ path: string; content: string }> }>(
          'GET',
          `/api/me/studio/games/${game}/versions/${version}/tree`,
        );
        return body.files;
      },
      importScript: async (script) => {
        stdout.write(script.endsWith('\n') ? script : `${script}\n`);
      },
      pushReconcile: async (src) => reconcilePush({ api, slug, cwd: process.cwd(), srcRef: src }),
    });
    return 0;
  } finally {
    rl.close();
  }
}

if (process.argv[1] && /git-remote-main\.(js|ts)$/.test(process.argv[1])) {
  void runGitRemoteHelper(process.argv, process.env).then((code) => process.exit(code));
}
