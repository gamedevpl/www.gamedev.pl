import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnv, renderDelegateStream } from './delegate.js';

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hostile-delegate.ndjson'),
  'utf8',
).trim();

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

  // A PAT is class-A too: it reaches the whole creator lifecycle, so it is a
  // bigger prize than the round key we deliberately hand over. CI creators hold
  // one under names we do not control, so the value pattern has to catch it.
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
});

describe('delegation event rendering', () => {
  it('renders a recorded NDJSON stream as adapter-owned inert lines', () => {
    const lines = renderDelegateStream('codex', fixture.split('\n'), false);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.startsWith('codex ▸ ')).toBe(true);
      expect(line.includes(String.fromCharCode(27))).toBe(false);
    }
    expect(lines.join('\n')).not.toMatch(/^✓ preview green$/m);
  });

  it('strips OSC from verbose raw adapter lines', () => {
    const osc = `${String.fromCharCode(27)}]0;pwn${String.fromCharCode(7)}`;
    const lines = renderDelegateStream('codex', [`{"text":"${osc}hi"}`], true);
    expect(lines.some((line) => line.startsWith('codex raw '))).toBe(true);
    for (const line of lines) {
      expect(line.includes(String.fromCharCode(27))).toBe(false);
    }
  });
});
