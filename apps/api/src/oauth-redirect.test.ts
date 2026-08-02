import { describe, expect, it } from 'vitest';
import { redirectUriAllowed, redirectUriMatches } from './oauth-redirect.js';

describe('oauth-redirect', () => {
  it('ignores port for loopback 127.0.0.1', () => {
    expect(redirectUriMatches('http://127.0.0.1:8080/callback', 'http://127.0.0.1:3000/callback')).toBe(true);
  });

  it('ignores port for loopback localhost', () => {
    expect(redirectUriMatches('http://localhost:9999/oauth/cb', 'http://localhost/c/oauth/cb')).toBe(false);
    expect(redirectUriMatches('http://localhost:9999/oauth/cb', 'http://localhost:1/oauth/cb')).toBe(true);
    expect(redirectUriMatches('http://localhost:9999/cb', 'http://localhost:1/cb')).toBe(true);
  });

  it('does not match near-miss loopback hosts', () => {
    expect(redirectUriMatches('http://127.0.0.1.evil.test/cb', 'http://127.0.0.1/cb')).toBe(false);
    expect(redirectUriMatches('http://localhost.evil.test/cb', 'http://localhost/cb')).toBe(false);
  });

  it('does not cross-match 127.0.0.1 and localhost', () => {
    expect(redirectUriMatches('http://127.0.0.1:8080/cb', 'http://localhost:3000/cb')).toBe(false);
  });

  it('requires exact match for non-loopback URIs', () => {
    expect(redirectUriMatches('https://app.example/cb', 'https://app.example/cb')).toBe(true);
    expect(redirectUriMatches('https://app.example/cb', 'https://evil.example/cb')).toBe(false);
  });

  it('redirectUriAllowed checks against a list', () => {
    expect(redirectUriAllowed('http://127.0.0.1:5555/done', ['http://127.0.0.1/done', 'https://other.test/cb'])).toBe(
      true,
    );
    expect(redirectUriAllowed('http://127.0.0.1:5555/done', ['https://other.test/cb'])).toBe(false);
  });
});
