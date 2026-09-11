import { afterEach, describe, expect, it } from 'vitest';
import {
  assertAgentTokenActive,
  DEFAULT_SELF_BUILD_KEY_TTL_DAYS,
  InvalidAgentTokenError,
  mintAgentToken,
  mintLegacyAgentToken,
  mintManagedMcpOpener,
  selfBuildKeyTtlDays,
  STALE_AGENT_TOKEN_REASON,
  verifyAgentToken,
  verifyManagedMcpOpener,
} from './agent-token.js';

describe('agent build-channel token', () => {
  const secret = 'super-secret-key';
  const now = Date.parse('2026-07-31T12:00:00.000Z');

  afterEach(() => {
    delete process.env.SELF_BUILD_KEY_TTL_DAYS;
    delete process.env.SELF_BUILD_CONNECT_DAYS;
  });

  it('mints and verifies a round-scoped token', () => {
    const token = mintAgentToken(42, secret, { roundGeneration: 1, now, ttlDays: 14 });
    expect(verifyAgentToken(token, secret)).toEqual({
      jobId: 42,
      roundGeneration: 1,
      exp: Math.floor(now / 1000) + 14 * 24 * 60 * 60,
    });
  });

  it('keeps a managed MCP opener separate from the build-channel capability', () => {
    const opener = mintManagedMcpOpener(42, secret, { roundGeneration: 1, now, ttlDays: 14 });
    const channel = mintAgentToken(42, secret, { roundGeneration: 1, now, ttlDays: 14 });

    expect(verifyManagedMcpOpener(opener, secret)).toMatchObject({ jobId: 42, roundGeneration: 1 });
    expect(() => verifyAgentToken(opener, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyManagedMcpOpener(channel, secret)).toThrow(InvalidAgentTokenError);
  });

  it('accepts an active generation before expiry', () => {
    const token = mintAgentToken(7, secret, { roundGeneration: 3, now, ttlDays: 14 });
    const claims = verifyAgentToken(token, secret);
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 3 }, now)).not.toThrow();
  });

  it('rejects a stale generation with the fresh-prompt reason', () => {
    const token = mintAgentToken(7, secret, { roundGeneration: 2, now, ttlDays: 14 });
    const claims = verifyAgentToken(token, secret);
    // One behind is a terminal-receipt for get_gate_verdict, but assertAgentTokenActive
    // (writes / other reads) still refuses it.
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 3 }, now)).toThrow(InvalidAgentTokenError);
    try {
      assertAgentTokenActive(claims, { roundGeneration: 3 }, now);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAgentTokenError);
      expect((error as Error).message).toBe(STALE_AGENT_TOKEN_REASON);
    }
    // Two behind is never a receipt.
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 4 }, now)).toThrow(InvalidAgentTokenError);
  });

  it('rejects an expired key the same way as a stale generation', () => {
    const token = mintAgentToken(7, secret, { roundGeneration: 1, now, ttlDays: 14 });
    const claims = verifyAgentToken(token, secret);
    const afterExpiry = now + 15 * 24 * 60 * 60 * 1000;
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 1 }, afterExpiry)).toThrowError(
      STALE_AGENT_TOKEN_REASON,
    );
  });

  it('regenerating a prompt mints a fresh exp without requiring a new generation', () => {
    const first = mintAgentToken(9, secret, { roundGeneration: 4, now, ttlDays: 14 });
    const later = now + 60_000;
    const second = mintAgentToken(9, secret, { roundGeneration: 4, now: later, ttlDays: 14 });
    const a = verifyAgentToken(first, secret);
    const b = verifyAgentToken(second, secret);
    expect(a.roundGeneration).toBe(b.roundGeneration);
    expect(b.exp).toBeGreaterThan(a.exp!);
    expect(() => assertAgentTokenActive(b, { roundGeneration: 4 }, later)).not.toThrow();
  });

  it('accepts a legacy token only while the job has no generation field', () => {
    const token = mintLegacyAgentToken(11, secret);
    const claims = verifyAgentToken(token, secret);
    expect(claims).toEqual({ jobId: 11 });
    expect(() => assertAgentTokenActive(claims, {}, now)).not.toThrow();
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 1 }, now)).toThrowError(STALE_AGENT_TOKEN_REASON);
  });

  it('rejects tampered claims', () => {
    const token = mintAgentToken(5, secret, { roundGeneration: 1, now, ttlDays: 14 });
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [jobId, generation, exp, signature] = decoded.split('.');
    const tamperedGeneration = Buffer.from(`${jobId}.${Number(generation) + 1}.${exp}.${signature}`, 'utf8').toString(
      'base64url',
    );
    const tamperedExp = Buffer.from(`${jobId}.${generation}.${Number(exp) + 1}.${signature}`, 'utf8').toString(
      'base64url',
    );
    const tamperedSig = Buffer.from(`${jobId}.${generation}.${exp}.${signature.slice(0, -1)}0`, 'utf8').toString(
      'base64url',
    );
    expect(() => verifyAgentToken(tamperedGeneration, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyAgentToken(tamperedExp, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyAgentToken(tamperedSig, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyAgentToken('not-a-token', secret)).toThrow(InvalidAgentTokenError);
  });

  it('defaults the TTL to 14 days and never exceeds the no-connect window', () => {
    expect(selfBuildKeyTtlDays()).toBe(DEFAULT_SELF_BUILD_KEY_TTL_DAYS);
    process.env.SELF_BUILD_KEY_TTL_DAYS = '30';
    process.env.SELF_BUILD_CONNECT_DAYS = '14';
    expect(selfBuildKeyTtlDays()).toBe(14);
  });
});
