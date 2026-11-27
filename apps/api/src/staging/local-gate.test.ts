import { describe, expect, it } from 'vitest';
import { gateIsolation, seatbeltProfile } from './local-gate.js';

describe('local gate isolation', () => {
  it('sandboxes on macOS and refuses an unisolated Linux run unless asked', () => {
    const saved = process.env.GATE_SANDBOX_USER;
    delete process.env.GATE_SANDBOX_USER;
    try {
      expect(gateIsolation(false, 'darwin')).toBe('seatbelt');
      expect(() => gateIsolation(false, 'linux')).toThrow(/unreviewed game code/);
      expect(gateIsolation(true, 'linux')).toBe('none');
      process.env.GATE_SANDBOX_USER = 'gate';
      expect(gateIsolation(false, 'linux')).toBe('sandbox-user');
    } finally {
      if (saved === undefined) delete process.env.GATE_SANDBOX_USER;
      else process.env.GATE_SANDBOX_USER = saved;
    }
  });

  it('denies HOME and remote network, and opens only the harness for writes', () => {
    const profile = seatbeltProfile({
      harness: '/tmp/h',
      home: '/Users/op',
      gamesRepo: '/Users/op/src/games',
      nodeDir: '/Users/op/.nvm/versions/node/v22',
      scratch: '/tmp/s',
    });
    expect(profile).toContain('(deny file-read* (subpath "/Users/op"))');
    expect(profile).toContain('(deny file-write* (subpath "/"))');
    expect(profile).toContain('(allow file-write* (subpath "/tmp/h")');
    expect(profile).not.toMatch(/allow file-write\*[^)]*\/Users\/op\/src\/games/);
    expect(profile).toContain('(deny network-outbound (remote ip "*:*"))');
    expect(profile).toContain('(allow file-read-metadata');
    expect(profile).toContain('(literal "/Users/op/.nvm")');
    expect(profile).toContain('(literal "/Users/op/.nvm/versions/node")');
    expect(profile).not.toMatch(/file-read-metadata[^\n]*\(subpath/);
  });
});
