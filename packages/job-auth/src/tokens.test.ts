import { describe, expect, it } from 'vitest';
import { InvalidJobTokenError, mintJobToken, verifyJobToken } from './tokens.js';

const SECRET = 'test-signing-secret';

describe('job tokens', () => {
  it('round-trips a token back to its job', () => {
    const token = mintJobToken('job_abc', SECRET);
    expect(verifyJobToken(token, SECRET).jobId).toBe('job_abc');
  });

  it('never embeds the signing secret in the token', () => {
    expect(mintJobToken('job_abc', SECRET)).not.toContain(SECRET);
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintJobToken('job_abc', 'some-other-secret');
    expect(() => verifyJobToken(token, SECRET)).toThrow(InvalidJobTokenError);
  });

  it('rejects a tampered job id', () => {
    // Re-encode a different jobId while keeping the original signature.
    const token = mintJobToken('job_abc', SECRET);
    const signature = token.split('.')[1];
    const forgedPayload = Buffer.from('job_victim.99999999999999').toString('base64url');
    expect(() => verifyJobToken(`${forgedPayload}.${signature}`, SECRET)).toThrow(/bad signature/);
  });

  it('rejects an expired token', () => {
    const now = Date.now();
    const token = mintJobToken('job_abc', SECRET, 1000, now);
    expect(verifyJobToken(token, SECRET, now + 500).jobId).toBe('job_abc');
    expect(() => verifyJobToken(token, SECRET, now + 1001)).toThrow(/expired/);
  });

  it('rejects malformed and missing tokens', () => {
    for (const bad of ['', 'nonsense', 'a.b.c']) {
      expect(() => verifyJobToken(bad, SECRET)).toThrow(InvalidJobTokenError);
    }
  });

  it('refuses to mint without a job id or secret', () => {
    expect(() => mintJobToken('', SECRET)).toThrow();
    expect(() => mintJobToken('job_abc', '')).toThrow();
    // '.' is the field separator, so it must not appear in a jobId.
    expect(() => mintJobToken('job.abc', SECRET)).toThrow();
  });
});
