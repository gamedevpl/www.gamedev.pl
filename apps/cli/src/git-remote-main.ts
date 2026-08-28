#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { createApi } from './api.js';
import { encryptedFileStore, memoryStore } from './keychain.js';
import { originFromEnv } from './oauth.js';
import { diffGame } from './checkout.js';
import { runRemoteHelper } from './git-remote.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function slugFromUrl(url: string): string {
  return url.replace(/^gamedev:\/\//, '').replace(/\/$/, '');
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

export async function runGitRemoteHelper(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const slug = slugFromUrl(argv[3] ?? argv[2] ?? readSlugFile(process.cwd()) ?? '');
  const api = createApi({ origin: originFromEnv(env), store: storeFromEnv(env), env });
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });
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
    pushReconcile: async () => {
      const diff = await diffGame({ api, slug, dest: process.cwd() });
      return diff.unreconciled ? 'unreconciled' : 'ok';
    },
  });
  rl.close();
  return 0;
}

if (process.argv[1] && /git-remote-main\.(js|ts)$/.test(process.argv[1])) {
  void runGitRemoteHelper(process.argv, process.env).then((code) => process.exit(code));
}
