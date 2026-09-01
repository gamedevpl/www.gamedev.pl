import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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
  readonly kind: 'keychain' | 'encrypted-file' | 'memory';
}

export function memoryStore(initial?: StoredTokens | null): TokenStore {
  let value = initial ?? null;
  return {
    kind: 'memory',
    async get() {
      return value;
    },
    async set(tokens) {
      value = tokens;
    },
    async clear() {
      value = null;
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
  return {
    kind: 'encrypted-file',
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
      mkdirSync(dirname(path), { recursive: true });
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      writeFileSync(path, Buffer.concat([iv, tag, encrypted]), { mode: 0o600 });
    },
    async clear() {
      try {
        writeFileSync(path, '', { mode: 0o600 });
      } catch {
        // missing file is already cleared
      }
    },
  };
}

export const FILE_FALLBACK_WARNING =
  'WARNING: OS keychain unavailable; tokens stored in an encrypted file under ~/.config/gamedevpl. Not plaintext, but weaker than the keychain.';

export function fileKeychainOptedIn(env: NodeJS.ProcessEnv): boolean {
  return env.GAMEDEV_ALLOW_FILE_KEYCHAIN === 'true' || Boolean(env.GAMEDEV_TOKEN_FILE);
}
