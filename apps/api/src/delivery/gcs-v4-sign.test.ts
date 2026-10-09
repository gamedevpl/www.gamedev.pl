import { describe, expect, it } from 'vitest';
import { signGcsReadUrl } from './gcs-sign.js';
import { signGcsUploadUrl } from './gcs-v4-sign.js';

describe('signGcsUploadUrl', () => {
  it('signs a PUT over the content type and cache control the upload must send', async () => {
    const at = () => Date.parse('2026-10-05T12:00:00.000Z');
    const object = 'games/g/versions/v1/bundle.html';
    const base = { bucket: 'b', object, now: at, serviceAccountEmail: 'runtime@example.com' };
    const capture = () => {
      const seen = { value: '' };
      const signBlob = async (stringToSign: string) => {
        seen.value = stringToSign;
        return Buffer.alloc(256, 1).toString('base64');
      };
      return { seen, signBlob };
    };
    const put = capture();
    const url = await signGcsUploadUrl({ ...base, contentType: 'text/html; charset=utf-8', signBlob: put.signBlob });
    expect(url).toMatch(/^https:\/\/storage\.googleapis\.com\/b\/games\/g\/versions\/v1\/bundle\.html\?/);
    expect(url).toContain(`X-Goog-SignedHeaders=${encodeURIComponent('cache-control;content-type;host')}`);

    // Same object and instant as a GET, different canonical request.
    const get = capture();
    await signGcsReadUrl({ ...base, signBlob: get.signBlob });
    expect(put.seen.value.split('\n').slice(0, 3)).toEqual(get.seen.value.split('\n').slice(0, 3));
    expect(put.seen.value).not.toBe(get.seen.value);
  });
});
