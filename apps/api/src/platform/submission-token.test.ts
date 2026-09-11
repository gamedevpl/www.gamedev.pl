import { describe, expect, it } from 'vitest';
import { InvalidTokenError, mintToken, verifyToken } from './submission-token.js';

describe('submission token', () => {
  const secret = 'super-secret-key';

  it('mints and verifies a token', () => {
    const token = mintToken(123, secret);
    expect(verifyToken(token, secret)).toBe(123);
  });

  it('rejects tampered tokens', () => {
    const token = mintToken(123, secret);
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [jobId, signature] = decoded.split('.');
    const tampered = Buffer.from(`${jobId}.${signature.slice(0, -1)}0`, 'utf8').toString('base64url');

    expect(() => verifyToken(tampered, secret)).toThrow(InvalidTokenError);
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyToken('invalid-token', secret)).toThrow(InvalidTokenError);
  });
});
