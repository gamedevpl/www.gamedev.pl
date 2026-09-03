import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encryptedFileStore, memoryStore } from './keychain.js';

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
});
