import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCreatorAgentKeyActive,
  creatorAgentKeyFingerprint,
  creatorAgentKeyTtlDays,
  DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS,
  InvalidAgentTokenError,
  looksLikeCreatorAgentKey,
  maskCreatorAgentKeyHeader,
  mintCreatorAgentKey,
  ROTATED_CREATOR_KEY_REASON,
  verifyCreatorAgentKey,
} from './agent-creator-key.js';
import { mintGameAgentKey } from './agent-game-key.js';
import { mintMcpSessionKey } from './mcp-session-key.js';

describe('durable creator agent key (BY-27a)', () => {
  const secret = 'creator-key-test-secret';
  const now = Date.parse('2026-08-02T12:00:00.000Z');
  const creatorUid = 'g:creator';

  afterEach(() => {
    delete process.env.CREATOR_AGENT_KEY_TTL_DAYS;
  });

  it('mints and verifies a round-trip key', () => {
    const key = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    expect(verifyCreatorAgentKey(key, secret)).toEqual({
      creatorUid,
      keyGeneration: 1,
      exp: Math.floor(now / 1000) + 90 * 24 * 60 * 60,
    });
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    expect(decoded.startsWith('c1.')).toBe(true);
  });

  it('rejects tampered claims', () => {
    const key = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 2, now, ttlDays: 90 });
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    const [prefix, kind, uid, generation, exp, signature] = decoded.split('.');
    const tamperedGeneration = Buffer.from(
      `${prefix}.${kind}.${uid}.${Number(generation) + 1}.${exp}.${signature}`,
      'utf8',
    ).toString('base64url');
    const tamperedExp = Buffer.from(
      `${prefix}.${kind}.${uid}.${generation}.${Number(exp) + 1}.${signature}`,
      'utf8',
    ).toString('base64url');
    const flipped = signature.endsWith('0') ? '1' : '0';
    const tamperedSig = Buffer.from(
      `${prefix}.${kind}.${uid}.${generation}.${exp}.${signature.slice(0, -1)}${flipped}`,
      'utf8',
    ).toString('base64url');
    expect(() => verifyCreatorAgentKey(tamperedGeneration, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyCreatorAgentKey(tamperedExp, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyCreatorAgentKey(tamperedSig, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyCreatorAgentKey('not-a-key', secret)).toThrow(InvalidAgentTokenError);
  });

  it('rejects an expired key', () => {
    const key = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    const claims = verifyCreatorAgentKey(key, secret);
    const afterExpiry = now + 91 * 24 * 60 * 60 * 1000;
    expect(() => assertCreatorAgentKeyActive(claims, { keyGeneration: 1 }, afterExpiry)).toThrow(
      ROTATED_CREATOR_KEY_REASON,
    );
  });

  it('rejects a stale keyGeneration', () => {
    const key = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    const claims = verifyCreatorAgentKey(key, secret);
    expect(() => assertCreatorAgentKeyActive(claims, { keyGeneration: 2 }, now)).toThrow(ROTATED_CREATOR_KEY_REASON);
  });

  it('rotate makes the old key fail and the new pass', () => {
    const oldKey = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    const newKey = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 2, now, ttlDays: 90 });
    const oldClaims = verifyCreatorAgentKey(oldKey, secret);
    const newClaims = verifyCreatorAgentKey(newKey, secret);
    expect(() => assertCreatorAgentKeyActive(oldClaims, { keyGeneration: 2 }, now)).toThrow(ROTATED_CREATOR_KEY_REASON);
    expect(() => assertCreatorAgentKeyActive(newClaims, { keyGeneration: 2 }, now)).not.toThrow();
  });

  it('round-trips Apple dotted subject identifiers', () => {
    const appleUid = 'a:001234.abcdef.0000';
    const key = mintCreatorAgentKey(secret, { creatorUid: appleUid, keyGeneration: 1, now, ttlDays: 90 });
    expect(verifyCreatorAgentKey(key, secret)).toEqual({
      creatorUid: appleUid,
      keyGeneration: 1,
      exp: Math.floor(now / 1000) + 90 * 24 * 60 * 60,
    });
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    expect(decoded.split('.')[2]).not.toContain('.');
  });

  it('does not false-positive on per-game or session keys', () => {
    const gameKey = mintGameAgentKey(secret, {
      slug: 'sky-dodge',
      creatorUid,
      keyGeneration: 1,
      now,
    });
    // Session ids are free-form; `c1` would collide if creator keys were also 5 fields.
    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: 'c1',
      jobId: 42,
      roundGeneration: 1,
      now,
    });
    expect(Buffer.from(sessionKey, 'base64url').toString('utf8').startsWith('c1.')).toBe(true);
    expect(looksLikeCreatorAgentKey(gameKey)).toBe(false);
    expect(looksLikeCreatorAgentKey(sessionKey)).toBe(false);
  });

  it('defaults TTL from CREATOR_AGENT_KEY_TTL_DAYS (90 days)', () => {
    expect(creatorAgentKeyTtlDays()).toBe(DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS);
    process.env.CREATOR_AGENT_KEY_TTL_DAYS = '30';
    expect(creatorAgentKeyTtlDays()).toBe(30);

    const key = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 1, now });
    const claims = verifyCreatorAgentKey(key, secret);
    expect(claims.exp).toBe(Math.floor(now / 1000) + 30 * 24 * 60 * 60);
  });

  it('masks the Authorization header to a fingerprint', () => {
    const key = mintCreatorAgentKey(secret, { creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    const fingerprint = creatorAgentKeyFingerprint(key);
    expect(fingerprint).toHaveLength(5);
    expect(maskCreatorAgentKeyHeader(key)).toBe(`Authorization: Bearer ····${fingerprint}`);
    expect(maskCreatorAgentKeyHeader(key)).not.toContain(key);
  });
});
