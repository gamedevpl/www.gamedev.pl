import { describe, expect, it } from 'vitest';
import { parseOAuthReturnParam, sanitizeOAuthReturnPath } from './oauthReturn.js';

describe('sanitizeOAuthReturnPath', () => {
  it('accepts bare authorize and authorize with query', () => {
    expect(sanitizeOAuthReturnPath('/oauth/authorize')).toBe('/oauth/authorize');
    expect(
      sanitizeOAuthReturnPath(
        '/oauth/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&code_challenge=x&code_challenge_method=S256',
      ),
    ).toMatch(/^\/oauth\/authorize\?/);
  });

  it('rejects open redirects and near-miss paths', () => {
    expect(sanitizeOAuthReturnPath('https://evil.test/oauth/authorize')).toBeNull();
    expect(sanitizeOAuthReturnPath('//evil.test/oauth/authorize')).toBeNull();
    expect(sanitizeOAuthReturnPath('/oauth/authorize/../admin')).toBeNull();
    expect(sanitizeOAuthReturnPath('/oauth/token')).toBeNull();
    expect(sanitizeOAuthReturnPath('/studio')).toBeNull();
    expect(sanitizeOAuthReturnPath('/oauth/authorize\n/evil')).toBeNull();
  });
});

describe('parseOAuthReturnParam', () => {
  it('reads oauth_return from the query string', () => {
    const path =
      '/oauth/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&code_challenge=x&code_challenge_method=S256';
    expect(parseOAuthReturnParam(`?oauth_return=${encodeURIComponent(path)}`)).toBe(path);
    expect(parseOAuthReturnParam(`oauth_return=${encodeURIComponent(path)}`)).toBe(path);
  });

  it('returns null when absent or unsafe', () => {
    expect(parseOAuthReturnParam('')).toBeNull();
    expect(parseOAuthReturnParam('?oauth_return=%2Fadmin')).toBeNull();
  });
});
