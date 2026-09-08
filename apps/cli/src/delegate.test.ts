import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnv, createDelegateStream, renderDelegateStream } from './delegate.js';

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

it('renders Antigravity tools without exposing transport JSON', () => {
  const rows = [
    { event: 'init', init: { cwd: '/private/path' } },
    { event: 'step_update', step_update: { step_type: 'tool', tool_name: 'read_file', state: 'ACTIVE' } },
    { event: 'step_update', step_update: { step_type: 'tool', tool_name: 'read_file', state: 'ERROR' } },
    { event: 'result', result: { status: 'SUCCESS', response: '' } },
  ];
  const output = renderDelegateStream(
    'agy',
    rows.map((row) => JSON.stringify(row)),
    false,
  ).join('\n');
  expect(output).toContain('⚙ read_file');
  expect(output).toContain('Tool failed: read_file');
  expect(output).not.toContain('SUCCESS');
  expect(output).not.toContain('/private/path');
});

it('shows Claude resume instructions only for the Claude adapter', () => {
  const event = JSON.stringify({ type: 'system', session_id: '12345678-1234-1234-1234-123456789abc' });
  expect(renderDelegateStream('claude', [event], false).join('')).toContain('claude --resume');
  expect(renderDelegateStream('cursor', [event], false).join('')).not.toContain('claude');
});

it('announces each Claude session once without swallowing later system messages or tool activity', () => {
  const render = createDelegateStream('claude');
  const session_id = '12345678-1234-1234-1234-123456789abc';
  const event = (data: object) => render(JSON.stringify({ session_id, ...data }));
  expect(event({ type: 'system', subtype: 'init' }).join('')).toContain('claude --resume');
  expect(event({ type: 'system', subtype: 'init' })).toEqual([]);
  expect(event({ type: 'system', subtype: 'status' })).toEqual([]);
  expect(event({ type: 'system', subtype: 'status', message: 'Compacting context' }).join('')).toContain(
    'Compacting context',
  );
  expect(event({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }).join('')).toContain(
    'Bash',
  );
  expect(event({ type: 'system' })).toEqual([]);
  expect(
    event({ type: 'system', subtype: 'init', session_id: 'abcdefab-1234-1234-1234-123456789abc' }).join(''),
  ).toContain('claude --resume');
});
