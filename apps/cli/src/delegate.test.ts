import { describe, expect, it } from 'vitest';
import { childEnv } from './delegate.js';

describe('delegation credential boundary', () => {
  it('strips creator OAuth material from the child environment', () => {
    const env = childEnv(
      {
        PATH: '/usr/bin',
        GAMEDEV_TOKEN: 'gdpl_oat_creator',
        SECRET: 'gdpl_oat_hidden',
        HOME: '/tmp',
      },
      'round-scoped-only',
    );
    expect(JSON.stringify(env)).not.toMatch(/gdpl_oat_/);
    expect(env.GAMEDEV_TOKEN).toBeUndefined();
    expect(env.GAMEDEV_ROUND_TOKEN).toBe('round-scoped-only');
    expect(env.PATH).toBe('/usr/bin');
  });

  // A PAT is class-A, so the child never sees one.
  it('strips creator PAT material under any variable name', () => {
    const env = childEnv(
      {
        PATH: '/usr/bin',
        CI_TOKEN: 'gdpl_pat_0123456789abcdef_secret',
        GDPL_PAT_BACKUP: 'whatever',
        HOME: '/tmp',
      },
      'round-scoped-only',
    );
    expect(JSON.stringify(env)).not.toMatch(/gdpl_pat_/);
    expect(env.CI_TOKEN).toBeUndefined();
    expect(env.GDPL_PAT_BACKUP).toBeUndefined();
    expect(env.GAMEDEV_ROUND_TOKEN).toBe('round-scoped-only');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('passes MCP auth without a round-token alias', () => {
    const env = childEnv({ PATH: '/usr/bin', GAMEDEV_ACCESS_TOKEN: 'gdpl_oat_creator' }, '', {
      url: 'https://www.gamedev.pl/api/mcp',
      authorization: 'Authorization: Bearer gdpl_cak_secret',
    });
    expect(env.GAMEDEV_ROUND_TOKEN).toBeUndefined();
    expect(env.GAMEDEV_ACCESS_TOKEN).toBeUndefined();
    expect(env.GAMEDEVPL_MCP_URL).toBe('https://www.gamedev.pl/api/mcp');
    expect(env.GAMEDEVPL_MCP_AUTHORIZATION).toBe('Authorization: Bearer gdpl_cak_secret');
  });
});
