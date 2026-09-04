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
