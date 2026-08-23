import { describe, expect, it } from 'vitest';
import { InvalidUnsubscribeTokenError, mintUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.js';
import { mintSessionToken } from '../platform/auth.js';

const secret = 'unsub-secret';

describe('unsubscribe token', () => {
  it('round-trips a uid', () => {
    const token = mintUnsubscribeToken('g:12345', secret);
    expect(verifyUnsubscribeToken(token, secret)).toBe('g:12345');
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintUnsubscribeToken('g:1', secret);
    expect(() => verifyUnsubscribeToken(token, 'other')).toThrow(InvalidUnsubscribeTokenError);
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyUnsubscribeToken('garbage', secret)).toThrow(InvalidUnsubscribeTokenError);
    expect(() => verifyUnsubscribeToken('a.b.c', secret)).toThrow(InvalidUnsubscribeTokenError);
  });

  it('is domain-separated from session tokens (a session token is not a valid unsub token)', () => {
    // Even sharing a secret, the unsub: prefix means a session token can't verify here.
    const session = mintSessionToken('g:1', secret);
    expect(() => verifyUnsubscribeToken(session, secret)).toThrow(InvalidUnsubscribeTokenError);
  });
});
