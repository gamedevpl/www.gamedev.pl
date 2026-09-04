import { describe, expect, it } from 'vitest';
import { InvalidAgentTokenError, STALE_AGENT_TOKEN_REASON } from '../platform/agent-token.js';
import {
  assertMcpSessionKeyUnexpired,
  mintMcpSessionKey,
  newMcpSessionId,
  verifyMcpSessionKey,
} from './mcp-session-key.js';

describe('mcp sessionKey', () => {
  const secret = 'mcp-test-secret';
  const now = Date.parse('2026-08-01T12:00:00.000Z');

  it('mints and verifies a sessionKey bound to session id + job + generation + exp', () => {
    const sessionId = newMcpSessionId();
    const key = mintMcpSessionKey(secret, {
      sessionId,
      jobId: 42,
      roundGeneration: 2,
      now,
      ttlHours: 24,
    });
    expect(verifyMcpSessionKey(key, secret)).toEqual({
      sessionId,
      jobId: 42,
      roundGeneration: 2,
      exp: Math.floor(now / 1000) + 24 * 60 * 60,
    });
  });

  it('rejects a tampered sessionKey', () => {
    const key = mintMcpSessionKey(secret, {
      sessionId: 'abc',
      jobId: 1,
      roundGeneration: 1,
      now,
      ttlHours: 1,
    });
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    parts[1] = '999';
    const forged = Buffer.from(parts.join('.'), 'utf8').toString('base64url');
    expect(() => verifyMcpSessionKey(forged, secret)).toThrow(InvalidAgentTokenError);
  });

  it('rejects an expired sessionKey', () => {
    const key = mintMcpSessionKey(secret, {
      sessionId: 's1',
      jobId: 1,
      roundGeneration: 1,
      now,
      ttlHours: 1,
    });
    const claims = verifyMcpSessionKey(key, secret);
    expect(() => assertMcpSessionKeyUnexpired(claims, now + 2 * 60 * 60 * 1000)).toThrowError(STALE_AGENT_TOKEN_REASON);
  });

  it('rejects a sessionId containing "." (token field delimiter)', () => {
    expect(() =>
      mintMcpSessionKey(secret, {
        sessionId: 'has.dot',
        jobId: 1,
        roundGeneration: 1,
        now,
        ttlHours: 1,
      }),
    ).toThrow(InvalidAgentTokenError);
  });
});
