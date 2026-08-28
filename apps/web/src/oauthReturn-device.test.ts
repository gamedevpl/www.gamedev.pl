import { describe, expect, it } from 'vitest';
import { sanitizeOAuthReturnPath } from './oauthReturn.js';

describe('sanitizeOAuthReturnPath device login', () => {
  it('accepts /device and /device with a user_code query', () => {
    expect(sanitizeOAuthReturnPath('/device')).toBe('/device');
    expect(sanitizeOAuthReturnPath('/device?user_code=ABCD-EFGH')).toBe('/device?user_code=ABCD-EFGH');
  });

  it('rejects near-miss device paths', () => {
    expect(sanitizeOAuthReturnPath('/device/../admin')).toBeNull();
    expect(sanitizeOAuthReturnPath('/devices')).toBeNull();
    expect(sanitizeOAuthReturnPath('https://evil.test/device')).toBeNull();
  });
});
