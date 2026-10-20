import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encryptedFileStore, FILE_FALLBACK_WARNING, memoryStore, type KeyVault } from './keychain.js';

function fakeVault(available = true): KeyVault & { keys: Map<string, Buffer> } {
  const keys = new Map<string, Buffer>();
  return {
    keys,
    load: (account) => keys.get(account) ?? null,
    save: (account, key) => available && Boolean(keys.set(account, key)),
  };
}

function homeKey(home: string): Buffer {
  return scryptSync(`gamedev-cli:${home}`, 'gdpl-cli-v1', 32);
}

function decryptsWith(path: string, key: Buffer): boolean {
  const buf = readFileSync(path);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    return true;
  } catch {
    return false;
  }
}

describe('token stores', () => {
  it('round-trips tokens in memory', async () => {
    const store = memoryStore();
    await store.set({ accessToken: 'gdpl_oat_abc', tokenType: 'Bearer', scope: 'creator' });
    expect((await store.get())?.accessToken).toBe('gdpl_oat_abc');
    await store.clear();
    expect(await store.get()).toBeNull();
  });

  it('never writes a plaintext gdpl_oat_ token to the encrypted file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedev-cli-'));
    const path = join(dir, 'credentials.bin');
    const store = encryptedFileStore({ HOME: dir, GAMEDEV_TOKEN_FILE: path });
    await store.set({ accessToken: 'gdpl_oat_secret', tokenType: 'Bearer', scope: 'creator' });
    const bytes = readFileSync(path);
    expect(bytes.toString('utf8')).not.toContain('gdpl_oat_secret');
    expect((await store.get())?.accessToken).toBe('gdpl_oat_secret');
  });

  it('describes the encrypted file store without claiming a keychain fallback', () => {
    expect(FILE_FALLBACK_WARNING.toLowerCase()).not.toMatch(/keychain|unavailable|fallback/);
    expect(FILE_FALLBACK_WARNING).toContain('encrypted file');
  });

  it('keys the default file with a random secret held in the OS vault', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gamedev-cli-'));
    const vault = fakeVault();
    const store = encryptedFileStore({ HOME: home }, { vault });
    await store.set({ accessToken: 'gdpl_oat_secret', tokenType: 'Bearer', scope: 'creator' });
    const path = join(home, '.config', 'gamedevpl', 'credentials.bin');
    expect(decryptsWith(path, homeKey(home))).toBe(false);
    expect(existsSync(`${path}.key`)).toBe(false);
    expect(vault.keys.size).toBe(1);
    expect((await encryptedFileStore({ HOME: home }, { vault }).get())?.accessToken).toBe('gdpl_oat_secret');
    expect(await encryptedFileStore({ HOME: home }, { vault: fakeVault() }).get()).toBeNull();
  });

  it('falls back to a private key file when no vault accepts the key', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gamedev-cli-'));
    const store = encryptedFileStore({ HOME: home }, { vault: fakeVault(false) });
    await store.set({ accessToken: 'gdpl_oat_secret', tokenType: 'Bearer', scope: 'creator' });
    const path = join(home, '.config', 'gamedevpl', 'credentials.bin');
    expect(decryptsWith(path, homeKey(home))).toBe(false);
    if (process.platform !== 'win32') expect(statSync(`${path}.key`).mode & 0o777).toBe(0o600);
    expect((await encryptedFileStore({ HOME: home }, { vault: null }).get())?.accessToken).toBe('gdpl_oat_secret');
  });

  it('keeps an explicit token file out of the OS vault', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedev-cli-'));
    const path = join(dir, 'credentials.bin');
    const vault = fakeVault();
    await encryptedFileStore({ HOME: dir, GAMEDEV_TOKEN_FILE: path }, { vault }).set({
      accessToken: 'gdpl_oat_secret',
      tokenType: 'Bearer',
      scope: 'creator',
    });
    expect(vault.keys.size).toBe(0);
    expect(decryptsWith(path, homeKey(dir))).toBe(false);
  });

  it('re-encrypts a HOME-keyed file under the new key on first read', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gamedev-cli-'));
    const path = join(home, '.config', 'gamedevpl', 'credentials.bin');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', homeKey(home), iv);
    const tokens = { accessToken: 'gdpl_oat_old', refreshToken: 'r', tokenType: 'Bearer', scope: 'creator' };
    const data = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
    await encryptedFileStore({ HOME: home }, { vault: fakeVault() }).clear();
    writeFileSync(path, Buffer.concat([iv, cipher.getAuthTag(), data]));
    const vault = fakeVault();
    expect(await encryptedFileStore({ HOME: home }, { vault }).get()).toEqual(tokens);
    expect(decryptsWith(path, homeKey(home))).toBe(false);
    expect(await encryptedFileStore({ HOME: home }, { vault }).get()).toEqual(tokens);
  });
});
