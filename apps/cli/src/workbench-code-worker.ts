import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PLAY_CODE_WORKER_HASH } from './generated/play-code-worker.js';
import { CLI_VERSION, releaseUrl } from './update.js';

export const CODE_WORKER_ASSET = 'play-typescript-worker.js.gz';
export async function loadCodeWorker(
  options: {
    env?: NodeJS.ProcessEnv;
    request?: typeof fetch;
    local?: URL;
    hash?: string;
  } = {},
): Promise<string> {
  const hash = options.hash ?? PLAY_CODE_WORKER_HASH;
  const decode = (bytes: Uint8Array) => {
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Worker checksum mismatch');
    return gunzipSync(bytes, { maxOutputLength: 12_000_000 }).toString('utf8');
  };
  const env = options.env ?? process.env;
  const cache = join(env.XDG_CACHE_HOME ?? join(env.HOME ?? homedir(), '.cache'), 'gamedevpl', 'code', hash);
  for (const path of [options.local ?? new URL('./generated/' + CODE_WORKER_ASSET, import.meta.url), cache]) {
    try {
      return decode(await readFile(path));
    } catch {
      // A missing or damaged cache falls back to the verified release asset.
    }
  }
  const response = await (options.request ?? fetch)(releaseUrl(CLI_VERSION, CODE_WORKER_ASSET), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || Number(response.headers.get('content-length')) > 3_000_000)
    throw Error('TypeScript worker download unavailable');
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!response.body) throw Error('TypeScript worker download unavailable');
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3_000_000) throw Error('TypeScript worker download exceeds limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  const script = decode(bytes);
  const temporary = cache + '.' + randomUUID();
  await mkdir(dirname(cache), { recursive: true });
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporary, cache);
  } finally {
    await rm(temporary, { force: true });
  }
  return script;
}
