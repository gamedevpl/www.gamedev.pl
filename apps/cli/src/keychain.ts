import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve as resolvePath } from 'node:path';
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

// Pre-vault files: the key came from HOME alone, so they are migrated on read.
function legacyFileKey(env: NodeJS.ProcessEnv): Buffer {
  return scryptSync(`gamedev-cli:${env.HOME ?? homedir()}`, 'gdpl-cli-v1', 32);
}

// Holds the random file key outside the credential file's directory.
export interface KeyVault {
  load(account: string): Buffer | null;
  save(account: string, key: Buffer): boolean;
}

const VAULT_SERVICE = 'gamedevpl-cli';
const VAULT_TIMEOUT_MS = 10_000;

function parseKey(hex: string | undefined): Buffer | null {
  const value = hex?.trim() ?? '';
  return /^[a-f0-9]{64}$/.test(value) ? Buffer.from(value, 'hex') : null;
}

function macKeychain(): KeyVault {
  return {
    load(account) {
      const found = spawnSync('security', ['find-generic-password', '-s', VAULT_SERVICE, '-a', account, '-w'], {
        encoding: 'utf8',
        timeout: VAULT_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return found.status === 0 ? parseKey(found.stdout) : null;
    },
    save(account, key) {
      // Interactive mode reads the secret from stdin, keeping it out of argv.
      const quoted = account.replace(/(["\\])/g, '\\$1');
      const saved = spawnSync('security', ['-i'], {
        input: `add-generic-password -U -s ${VAULT_SERVICE} -a "${quoted}" -w ${key.toString('hex')}\n`,
        encoding: 'utf8',
        timeout: VAULT_TIMEOUT_MS,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      return saved.status === 0 && this.load(account)?.equals(key) === true;
    },
  };
}

function secretService(): KeyVault {
  const attributes = (account: string) => ['service', VAULT_SERVICE, 'account', account];
  return {
    load(account) {
      const found = spawnSync('secret-tool', ['lookup', ...attributes(account)], {
        encoding: 'utf8',
        timeout: VAULT_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return found.status === 0 ? parseKey(found.stdout) : null;
    },
    save(account, key) {
      const saved = spawnSync('secret-tool', ['store', '--label=gamedevpl CLI', ...attributes(account)], {
        input: key.toString('hex'),
        encoding: 'utf8',
        timeout: VAULT_TIMEOUT_MS,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      return saved.status === 0 && this.load(account)?.equals(key) === true;
    },
  };
}

export function platformKeyVault(platform: NodeJS.Platform = process.platform): KeyVault | null {
  if (platform === 'darwin') return macKeychain();
  if (platform === 'linux') return secretService();
  return null;
}

function readKeyFile(path: string): Buffer | null {
  try {
    return parseKey(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeKeyFile(path: string, key: Buffer): void {
  const temporary = `${path}.${process.pid}-${randomBytes(12).toString('hex')}`;
  try {
    writeFileSync(temporary, `${key.toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function encryptedFileStore(
  env: NodeJS.ProcessEnv = process.env,
  options: { vault?: KeyVault | null } = {},
): TokenStore {
  const path = filePath(env);
  const keyPath = `${path}.key`;
  // An explicit file store keeps its key beside it; the default asks the OS vault.
  const vault = fileKeychainOptedIn(env) ? null : options.vault === undefined ? platformKeyVault() : options.vault;
  const account = resolvePath(path);
  let cached: Buffer[] | null = null;
  function knownKeys(): Buffer[] {
    if (cached?.length) return cached;
    cached = [vault?.load(account) ?? null, readKeyFile(keyPath)].filter((key): key is Buffer => key !== null);
    return cached;
  }
  function createKey(): Buffer {
    const existing = knownKeys()[0];
    if (existing) return existing;
    const key = randomBytes(32);
    mkdirSync(dirname(path), { recursive: true });
    if (!vault?.save(account, key)) writeKeyFile(keyPath, key);
    cached = [key];
    return key;
  }
  function decryptKnown(buf: Buffer): StoredTokens | null {
    for (const key of knownKeys()) {
      const tokens = decrypt(buf, key);
      if (tokens) return tokens;
    }
    return null;
  }
  const withLock = <T>(run: () => Promise<T>, signal?: AbortSignal) => withCredentialLock(path, run, signal);
  async function write(tokens: StoredTokens | null): Promise<void> {
    await withLock(async () => {
      mkdirSync(dirname(path), { recursive: true });
      let buf = Buffer.alloc(0);
      if (tokens) {
        const key = createKey();
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
  function readFile(): Buffer | null {
    try {
      return readFileSync(path);
    } catch {
      return null;
    }
  }
  async function migrateLegacy(): Promise<StoredTokens | null> {
    return withLock(async () => {
      const buf = readFile();
      if (!buf) return null;
      const current = decryptKnown(buf);
      if (current) return current;
      const legacy = decrypt(buf, legacyFileKey(env));
      if (legacy) await write(legacy);
      return legacy;
    });
  }
  return {
    kind: 'encrypted-file',
    withLock,
    async get() {
      const buf = readFile();
      if (!buf?.length) return null;
      const tokens = decryptKnown(buf);
      if (tokens) return tokens;
      if (!decrypt(buf, legacyFileKey(env))) return null;
      try {
        return await migrateLegacy();
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

function decrypt(buf: Buffer, key: Buffer): StoredTokens | null {
  try {
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
}

export const FILE_FALLBACK_WARNING =
  'WARNING: tokens stored in an encrypted file under ~/.config/gamedevpl. Not plaintext.';

export function fileKeychainOptedIn(env: NodeJS.ProcessEnv): boolean {
  return env.GAMEDEV_ALLOW_FILE_KEYCHAIN === 'true' || Boolean(env.GAMEDEV_TOKEN_FILE);
}
