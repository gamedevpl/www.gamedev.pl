import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { withCredentialLock } from './credential-lock.js';

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string;
}

export interface TokenStore {
  get(): Promise<StoredTokens | null>;
  set(tokens: StoredTokens): Promise<void>;
  clear(): Promise<void>;
  withLock<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  readonly kind: 'keychain' | 'encrypted-file' | 'memory';
}

export function memoryStore(initial?: StoredTokens | null): TokenStore {
  let value = initial ?? null;
  let queue = Promise.resolve();
  const held = new AsyncLocalStorage<boolean>();
  async function withLock<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (held.getStore()) return run();
    const result = queue.then(() => {
      signal?.throwIfAborted();
      return held.run(true, run);
    });
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  return {
    kind: 'memory',
    withLock,
    async get() {
      return value;
    },
    async set(tokens) {
      await withLock(async () => {
        value = tokens;
      });
    },
    async clear() {
      await withLock(async () => {
        value = null;
      });
    },
  };
}

function filePath(env: NodeJS.ProcessEnv): string {
  const override = env.GAMEDEV_TOKEN_FILE;
  if (override) return override;
  return join(env.HOME ?? homedir(), '.config', 'gamedevpl', 'credentials.bin');
}

function fileKey(env: NodeJS.ProcessEnv): Buffer {
  return scryptSync(`gamedev-cli:${env.HOME ?? homedir()}`, 'gdpl-cli-v1', 32);
}

export function encryptedFileStore(env: NodeJS.ProcessEnv = process.env): TokenStore {
  const path = filePath(env);
  const key = fileKey(env);
  const withLock = <T>(run: () => Promise<T>, signal?: AbortSignal) => withCredentialLock(path, run, signal);
  async function write(tokens: StoredTokens | null): Promise<void> {
    await withLock(async () => {
      mkdirSync(dirname(path), { recursive: true });
      let buf = Buffer.alloc(0);
      if (tokens) {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
        buf = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
      }
      const temporary = `${path}.${process.pid}-${randomBytes(12).toString('hex')}`;
      try {
        writeFileSync(temporary, buf, { mode: 0o600, flag: 'wx' });
        renameSync(temporary, path);
      } finally {
        rmSync(temporary, { force: true });
      }
    });
  }
  return {
    kind: 'encrypted-file',
    withLock,
    async get() {
      try {
        const buf = readFileSync(path);
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const data = buf.subarray(28);
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
        return JSON.parse(json) as StoredTokens;
      } catch {
        return null;
      }
    },
    async set(tokens) {
      await write(tokens);
    },
    async clear() {
      await write(null);
    },
  };
}

export const FILE_FALLBACK_WARNING =
  'WARNING: tokens stored in an encrypted file under ~/.config/gamedevpl. Not plaintext.';

export function fileKeychainOptedIn(env: NodeJS.ProcessEnv): boolean {
  return env.GAMEDEV_ALLOW_FILE_KEYCHAIN === 'true' || Boolean(env.GAMEDEV_TOKEN_FILE);
}
