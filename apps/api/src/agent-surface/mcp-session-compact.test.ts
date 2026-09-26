import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidAgentTokenError } from '../platform/agent-token.js';
import { bindCapabilityRevision } from '../platform/capability-revision.js';
import { mintMcpSessionKey, newMcpSessionId, verifyMcpSessionKey } from './mcp-session-key.js';
import { looksLikeMcpSessionKey } from './mcp-session-shape.js';

describe('compact MCP session keys', () => {
  const secret = 'mcp-test-secret';
  const now = Date.parse('2026-08-01T12:00:00.000Z');

  it('round-trips an Apple uid that contains dots', () => {
    const appleUid = 'a:001234.abcdef.0000';
    const sessionId = newMcpSessionId();
    const key = mintMcpSessionKey(secret, {
      sessionId,
      jobId: 42,
      roundGeneration: 2,
      now,
      ttlHours: 24,
      actorUid: appleUid,
    });
    expect(verifyMcpSessionKey(key, secret).actorUid).toBe(appleUid);
    expect(looksLikeMcpSessionKey(key)).toBe(true);
    expect(key.length).toBeLessThan(250);
  });

  it('accepts previously issued session keys with membership revisions', () => {
    const sessionId = 'old-session';
    const exp = Math.floor(now / 1000) + 3600;
    const payload = `mcp-session-v1:${sessionId}:42:2:${exp}:g:bea`;
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    const legacy = bindCapabilityRevision(
      Buffer.from(`${sessionId}.42.2.${exp}.${Buffer.from('g:bea').toString('base64url')}.${signature}`).toString(
        'base64url',
      ),
      3,
      secret,
    );
    expect(verifyMcpSessionKey(legacy, secret)).toEqual({
      sessionId,
      jobId: 42,
      roundGeneration: 2,
      exp,
      actorUid: 'g:bea',
      actorRevision: 3,
    });
  });

  it('binds the membership revision in compact keys', () => {
    const key = mintMcpSessionKey(secret, {
      sessionId: 'current-session',
      jobId: 42,
      roundGeneration: 2,
      now,
      actorUid: 'g:bea',
      actorRevision: 3,
    });
    expect(verifyMcpSessionKey(key, secret).actorRevision).toBe(3);
    const [payload, signature] = key.slice('mcp2_'.length).split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as unknown[];
    claims[5] = 4;
    const forged = `mcp2_${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
    expect(() => verifyMcpSessionKey(forged, secret)).toThrow(InvalidAgentTokenError);
  });
});
