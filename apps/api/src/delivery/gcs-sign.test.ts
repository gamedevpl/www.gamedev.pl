import { createPrivateKey, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGcsObjectStore, signGcsReadUrl } from './gcs-sign.js';

describe('signGcsReadUrl', () => {
  it('builds a V4 GET URL with hex signature from a base64 signBlob digest', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

    const url = await signGcsReadUrl({
      bucket: 'gamedevpl-games-store',
      object: 'kits/abc123.tgz',
      expiresSeconds: 900,
      now: () => Date.parse('2026-07-31T12:00:00.000Z'),
      serviceAccountEmail: 'runtime@gamedevpl.iam.gserviceaccount.com',
      signBlob: async (stringToSign) =>
        cryptoSign('RSA-SHA256', Buffer.from(stringToSign, 'utf8'), createPrivateKey(pem)).toString('base64'),
    });

    expect(url).toMatch(/^https:\/\/storage\.googleapis\.com\/gamedevpl-games-store\/kits\/abc123\.tgz\?/);
    expect(url).toContain('X-Goog-Algorithm=GOOG4-RSA-SHA256');
    expect(url).toContain(
      encodeURIComponent('runtime@gamedevpl.iam.gserviceaccount.com/20260731/auto/storage/goog4_request'),
    );
    expect(url).toContain('X-Goog-Expires=900');
    expect(url).toMatch(/X-Goog-Signature=[0-9a-f]{512,}/);
  });
});

describe('createGcsObjectStore', () => {
  it('reads objects and signs without downloading for objectExists', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('alt=media')) {
        return new Response(Buffer.from('{"current":"abc"}'), { status: 200 });
      }
      if (url.includes('/o/kits%2Fcurrent.json') || url.includes('/o/kits/current.json')) {
        return new Response('{}', { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const store = createGcsObjectStore({
      bucket: 'b',
      fetchImpl,
      getAccessToken: async () => 'tok',
      serviceAccountEmail: 'sa@example.com',
      signBlob: async () => Buffer.alloc(256, 1).toString('base64'),
      now: () => Date.parse('2026-07-31T12:00:00.000Z'),
    });

    expect((await store.readObject('kits/current.json'))?.toString('utf8')).toContain('current');
    expect(await store.objectExists('kits/current.json')).toBe(true);
    expect(await store.objectExists('kits/missing.tgz')).toBe(false);
    const signed = await store.signReadUrl('kits/abc.tgz', 60);
    expect(signed).toContain('X-Goog-Signature=');
    expect(calls.some((c) => c.includes('alt=media'))).toBe(true);
    expect(calls.some((c) => !c.includes('alt=media') && c.includes('kits'))).toBe(true);
  });
});
