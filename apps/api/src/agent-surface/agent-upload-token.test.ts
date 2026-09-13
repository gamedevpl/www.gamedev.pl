import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidAgentTokenError } from '../platform/agent-token.js';
import {
  assertUploadTokenUnexpired,
  mintUploadToken,
  uploadCurlCommand,
  verifyUploadToken,
} from './agent-upload-token.js';

const secret = 'upload-test-secret';

describe('agent-upload-token', () => {
  it('round-trips a screenshot upload token', () => {
    const token = mintUploadToken(secret, {
      jobId: 55,
      roundGeneration: 1,
      kind: 'screenshot',
      label: 'first frame',
      now: 1_700_000_000_000,
      ttlSeconds: 900,
    });
    const claims = verifyUploadToken(token, secret);
    expect(claims).toMatchObject({
      jobId: 55,
      roundGeneration: 1,
      kind: 'screenshot',
      label: 'first frame',
      exp: 1_700_000_000 + 900,
    });
    expect(claims.nonce).toMatch(/^[a-f0-9]+$/);
    assertUploadTokenUnexpired(claims, 1_700_000_000_000 + 60_000);
  });

  it('still accepts a URL the previous revision minted', () => {
    // A deploy leaves URLs in flight; 401 breaks live sessions.
    const exp = 1_700_000_000 + 900;
    const nonce = 'abc123';
    const signature = createHmac('sha256', secret)
      .update(`agent-upload-v1:55:1:screenshot:::${exp}:${nonce}`)
      .digest('hex');
    const legacy = Buffer.from(`55.1.screenshot...${exp}.${nonce}.${signature}`, 'utf8').toString('base64url');

    const claims = verifyUploadToken(legacy, secret);

    expect(claims).toMatchObject({ jobId: 55, roundGeneration: 1, kind: 'screenshot' });
    expect(claims.version).toBeUndefined();
  });

  it('round-trips the delivery a concept URL was issued for', () => {
    const token = mintUploadToken(secret, {
      jobId: 55,
      roundGeneration: 2,
      kind: 'screenshot',
      version: 'v7',
      now: 1_700_000_000_000,
      ttlSeconds: 900,
    });

    expect(verifyUploadToken(token, secret)).toMatchObject({ version: 'v7' });
  });

  it('binds stage path into the signature', () => {
    const token = mintUploadToken(secret, {
      jobId: 7,
      roundGeneration: 2,
      kind: 'stage',
      path: 'game/render.ts',
    });
    const claims = verifyUploadToken(token, secret);
    expect(claims.path).toBe('game/render.ts');
    expect(claims.kind).toBe('stage');
  });

  it('rejects a tampered path', () => {
    const token = mintUploadToken(secret, {
      jobId: 7,
      roundGeneration: 1,
      kind: 'stage',
      path: 'game.ts',
    });
    const wire = Buffer.from(token, 'base64url').toString('utf8');
    const parts = wire.split('.');
    parts[3] = Buffer.from('evil.ts', 'utf8').toString('base64url');
    const tampered = Buffer.from(parts.join('.'), 'utf8').toString('base64url');
    expect(() => verifyUploadToken(tampered, secret)).toThrow(InvalidAgentTokenError);
  });

  it('rejects an expired token', () => {
    const token = mintUploadToken(secret, {
      jobId: 1,
      roundGeneration: 1,
      kind: 'screenshot',
      now: 1_000_000,
      ttlSeconds: 1,
    });
    const claims = verifyUploadToken(token, secret);
    expect(() => assertUploadTokenUnexpired(claims, 1_000_000 + 2_000)).toThrow(/finished/i);
  });

  it('requires a path for stage uploads', () => {
    expect(() =>
      mintUploadToken(secret, {
        jobId: 1,
        roundGeneration: 1,
        kind: 'stage',
      }),
    ).toThrow(/path/i);
  });

  it('builds a curl --upload-file one-liner carrying an explicit content type', () => {
    expect(uploadCurlCommand("https://example.com/u?token=a'b", 'shot.png', 'image/png')).toBe(
      "curl -H 'Content-Type: image/png' --upload-file shot.png 'https://example.com/u?token=a'\\''b'",
    );
  });
});
