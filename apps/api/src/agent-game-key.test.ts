import { afterEach, describe, expect, it } from 'vitest';
import {
  assertGameAgentKeyActive,
  DEFAULT_GAME_AGENT_KEY_TTL_DAYS,
  gameAgentKeyTtlDays,
  InvalidAgentTokenError,
  looksLikeGameAgentKey,
  mintGameAgentKey,
  ROTATED_GAME_KEY_REASON,
  verifyGameAgentKey,
} from './agent-game-key.js';
import { mintMcpSessionKey } from './mcp-session-key.js';

describe('durable per-game agent key (BY-23)', () => {
  const secret = 'game-key-test-secret';
  const now = Date.parse('2026-07-31T12:00:00.000Z');
  const slug = 'sky-dodge';
  const creatorUid = 'g:creator';

  afterEach(() => {
    delete process.env.GAME_AGENT_KEY_TTL_DAYS;
  });

  it('mints and verifies a round-trip key', () => {
    const key = mintGameAgentKey(secret, { slug, creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    expect(verifyGameAgentKey(key, secret)).toEqual({
      slug,
      creatorUid,
      keyGeneration: 1,
      exp: Math.floor(now / 1000) + 90 * 24 * 60 * 60,
    });
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    expect(decoded.startsWith('g1.')).toBe(true);
  });

  it('rejects tampered claims', () => {
    const key = mintGameAgentKey(secret, { slug, creatorUid, keyGeneration: 2, now, ttlDays: 90 });
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    const [prefix, slugPart, uid, generation, exp, signature] = decoded.split('.');
    const tamperedGeneration = Buffer.from(
      `${prefix}.${slugPart}.${uid}.${Number(generation) + 1}.${exp}.${signature}`,
      'utf8',
    ).toString('base64url');
    const tamperedExp = Buffer.from(
      `${prefix}.${slugPart}.${uid}.${generation}.${Number(exp) + 1}.${signature}`,
      'utf8',
    ).toString('base64url');
    const tamperedSig = Buffer.from(
      `${prefix}.${slugPart}.${uid}.${generation}.${exp}.${signature.slice(0, -1)}0`,
      'utf8',
    ).toString('base64url');
    expect(() => verifyGameAgentKey(tamperedGeneration, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyGameAgentKey(tamperedExp, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyGameAgentKey(tamperedSig, secret)).toThrow(InvalidAgentTokenError);
    expect(() => verifyGameAgentKey('not-a-key', secret)).toThrow(InvalidAgentTokenError);
  });

  it('rejects an expired key', () => {
    const key = mintGameAgentKey(secret, { slug, creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    const claims = verifyGameAgentKey(key, secret);
    const afterExpiry = now + 91 * 24 * 60 * 60 * 1000;
    expect(() => assertGameAgentKeyActive(claims, { keyGeneration: 1 }, afterExpiry)).toThrow(ROTATED_GAME_KEY_REASON);
  });

  it('rejects a stale keyGeneration', () => {
    const key = mintGameAgentKey(secret, { slug, creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    const claims = verifyGameAgentKey(key, secret);
    expect(() => assertGameAgentKeyActive(claims, { keyGeneration: 2 }, now)).toThrow(ROTATED_GAME_KEY_REASON);
  });

  it('rotate makes the old key fail and the new pass', () => {
    const oldKey = mintGameAgentKey(secret, { slug, creatorUid, keyGeneration: 1, now, ttlDays: 90 });
    const newKey = mintGameAgentKey(secret, { slug, creatorUid, keyGeneration: 2, now, ttlDays: 90 });
    const oldClaims = verifyGameAgentKey(oldKey, secret);
    const newClaims = verifyGameAgentKey(newKey, secret);
    expect(() => assertGameAgentKeyActive(oldClaims, { keyGeneration: 2 }, now)).toThrow(ROTATED_GAME_KEY_REASON);
    expect(() => assertGameAgentKeyActive(newClaims, { keyGeneration: 2 }, now)).not.toThrow();
  });

  it('round-trips Apple dotted subject identifiers', () => {
    const appleUid = 'a:001234.abcdef.0000';
    const key = mintGameAgentKey(secret, { slug, creatorUid: appleUid, keyGeneration: 1, now, ttlDays: 90 });
    expect(verifyGameAgentKey(key, secret)).toEqual({
      slug,
      creatorUid: appleUid,
      keyGeneration: 1,
      exp: Math.floor(now / 1000) + 90 * 24 * 60 * 60,
    });
    const decoded = Buffer.from(key, 'base64url').toString('utf8');
    expect(decoded.split('.')[2]).not.toContain('.');
  });

  it('does not false-positive on MCP session keys whose session id is g1', () => {
    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: 'g1',
      jobId: 42,
      roundGeneration: 1,
      now,
    });
    const decoded = Buffer.from(sessionKey, 'base64url').toString('utf8');
    expect(decoded.startsWith('g1.')).toBe(true);
    expect(looksLikeGameAgentKey(sessionKey)).toBe(false);
  });

  it('defaults TTL from GAME_AGENT_KEY_TTL_DAYS (90 days)', () => {
    expect(gameAgentKeyTtlDays()).toBe(DEFAULT_GAME_AGENT_KEY_TTL_DAYS);
    process.env.GAME_AGENT_KEY_TTL_DAYS = '30';
    expect(gameAgentKeyTtlDays()).toBe(30);

    const key = mintGameAgentKey(secret, { slug, creatorUid, keyGeneration: 1, now });
    const claims = verifyGameAgentKey(key, secret);
    expect(claims.exp).toBe(Math.floor(now / 1000) + 30 * 24 * 60 * 60);
  });
});
