import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { discoverAgents, formatAgents } from './agents.js';
import { loadAdapters, whichOnPath } from './adapters.js';
import { runCli } from './main.js';
import { handleReplLine } from './repl.js';
import type { ApiClient } from './api.js';
import { connectGame } from './connect.js';

const dirs: string[] = [];
function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gdpl-agents-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('agent discovery', () => {
  it('ignores non-executable files and directories, following PATH order', () => {
    const first = directory();
    const second = directory();
    writeFileSync(join(first, 'claude'), '');
    chmodSync(join(first, 'claude'), 0o600);
    mkdirSync(join(first, 'codex'));
    writeFileSync(join(second, 'claude'), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
    const env = { PATH: [first, second].join(delimiter) };
    expect(whichOnPath('claude', env)).toBe(join(second, 'claude'));
    expect(whichOnPath('codex', env)).toBeNull();
  });

  it('separates detected programs from executable integrations', () => {
    const agents = discoverAgents({ HOME: directory() }, (cmd) => `/bin/${cmd}`);
    expect(agents.find((row) => row.name === 'claude')).toMatchObject({ installed: true, local: true, mcp: true });
    expect(agents.find((row) => row.name === 'vibe')).toMatchObject({ installed: true, local: true, mcp: false });
    for (const name of ['agy', 'cursor']) {
      expect(agents.find((row) => row.name === name)).toMatchObject({ installed: true, local: true, mcp: false });
    }
    expect(formatAgents(agents)).toContain('launch verifies required CLI flags');
  });

  it('admits custom local adapters without inventing MCP wiring', () => {
    const file = loadAdapters({ HOME: directory() });
    file.adapters = [{ ...file.adapters[0]!, name: 'agy', command: 'agy' }];
    const rows = discoverAgents({}, () => '/bin/agy', file).filter((row) => row.name === 'agy');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ local: true, mcp: false });
  });

  it('lists agents as JSON without login, a TTY, network or execution', async () => {
    const dir = directory();
    writeFileSync(join(dir, 'claude'), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
    const fetch = vi.fn(() => {
      throw new Error('no network');
    });
    vi.stubGlobal('fetch', fetch);
    const stdout = new PassThrough();
    let output = '';
    stdout.on('data', (chunk: Buffer) => {
      output += String(chunk);
    });
    const code = await runCli(
      ['node', 'gamedevpl', 'agents', '--json'],
      { HOME: dir, PATH: dir },
      {
        stdin: new PassThrough() as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        stderr: new PassThrough() as unknown as NodeJS.WriteStream,
      },
    );
    expect(code).toBe(0);
    expect(JSON.parse(output).agents.filter((row: { installed: boolean }) => row.installed)).toEqual([
      { name: 'claude', command: 'claude', installed: true, local: true, mcp: true },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels an MCP agent choice before any API call or handoff', async () => {
    const dir = directory();
    for (const cmd of ['claude', 'codex', 'vibe', 'cursor']) {
      writeFileSync(join(dir, cmd), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
    }
    const request = vi.fn(async () => {
      throw new Error('should not call API');
    });
    const pick = vi.fn(async (_choices: string[], _question: string) => '/quit');
    await handleReplLine({
      line: '/connect sky-dodge --handoff',
      api: { request } as unknown as ApiClient,
      token: null,
      env: { HOME: dir, PATH: dir },
      pick,
      write: () => undefined,
    });
    expect(pick.mock.calls[0]?.[0]).toEqual(['claude', 'codex', 'show manual MCP setup']);
    expect(request).not.toHaveBeenCalled();
  });

  it('runs a real child without a checkout, preserving scratch files and removing MCP credentials', async () => {
    const dir = directory();
    writeFileSync(
      join(dir, 'claude'),
      `#!${process.execPath}
if (process.argv.includes('auth')) { console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' })); process.exit(0); }
if (process.argv.includes('--help')) { console.log('-p --verbose --permission-mode --output-format'); process.exit(0); }
if (process.env.ANTHROPIC_API_KEY) process.exit(90);
const fs = require('node:fs');
const args = process.argv.slice(2);
const config = args[args.indexOf('--mcp-config') + 1];
if (!fs.readFileSync(config, 'utf8').includes('gdpl_cak_test')) process.exit(2);
fs.writeFileSync('scratch.txt', 'kept');
console.log(JSON.stringify({ text: JSON.stringify({ cwd: process.cwd(), config }) }));
`,
      { mode: 0o700 },
    );
    const api = {
      request: async (_method: string, path: string) =>
        path.includes('/api/me/studio')
          ? { games: [{ slug: 'sky-dodge', token: 'tok' }] }
          : {
              mcpUrl: 'https://example.test/mcp',
              authorizationHeader: 'Bearer gdpl_cak_test',
              kickoffPrompt: 'Build it',
            },
    } as unknown as ApiClient;
    const lines: string[] = [];
    await connectGame({
      api,
      slug: 'sky-dodge',
      dest: dir,
      agent: 'claude',
      env: { PATH: dir, HOME: dir, ANTHROPIC_API_KEY: 'must-not-reach-child' },
      write: (line) => lines.push(line),
    });
    const report = JSON.parse(lines.find((line) => line.startsWith('claude ▸ {'))!.split(' ▸ ')[1]!) as {
      cwd: string;
      config: string;
    };
    dirs.push(report.cwd);
    expect(report.cwd).not.toBe(dir);
    expect(readFileSync(join(report.cwd, 'scratch.txt'), 'utf8')).toBe('kept');
    expect(existsSync(report.config)).toBe(false);
    expect(lines.at(-1)).toContain('check the round in Studio');
  });

  it('waits for a pending handoff before fetching MCP credentials or spawning', async () => {
    const paths: string[] = [];
    const api = {
      request: async (_method: string, path: string) => {
        paths.push(path);
        return path.includes('/api/me/studio') ? { games: [{ slug: 'sky-dodge', token: 'tok' }] } : { pending: true };
      },
    } as unknown as ApiClient;
    const runAdapter = vi.fn(async () => ({ code: 0, lines: [] }));
    await expect(
      connectGame({
        api,
        slug: 'sky-dodge',
        dest: directory(),
        agent: 'claude',
        handoff: true,
        which: () => '/bin/claude',
        runAdapter,
        write: () => undefined,
      }),
    ).rejects.toThrow('handoff pending');
    expect(paths.some((path) => path.endsWith('/connect'))).toBe(false);
    expect(runAdapter).not.toHaveBeenCalled();
  });

  it('streams MCP progress before exit and stops the child when cancelled', async () => {
    const dir = directory();
    writeFileSync(
      join(dir, 'claude'),
      `#!${process.execPath}
if (process.argv.includes('auth')) { console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' })); process.exit(0); }
if (process.argv.includes('--help')) { console.log('-p --verbose --permission-mode --output-format'); process.exit(0); }
process.on('SIGTERM', () => {});
console.log(JSON.stringify({ text: 'working' }));
setInterval(() => {}, 1000);
`,
      { mode: 0o700 },
    );
    const api = {
      request: async (_method: string, path: string) =>
        path.includes('/api/me/studio')
          ? { games: [{ slug: 'sky-dodge', token: 'tok' }] }
          : {
              mcpUrl: 'https://example.test/mcp',
              authorizationHeader: 'Bearer gdpl_cak_test',
              kickoffPrompt: 'Build it',
            },
    } as unknown as ApiClient;
    const controller = new AbortController();
    await expect(
      connectGame({
        api,
        slug: 'sky-dodge',
        dest: dir,
        agent: 'claude',
        env: { PATH: dir, HOME: dir },
        abort: controller.signal,
        write: (line) => {
          if (line.startsWith('MCP workspace: ')) dirs.push(line.slice('MCP workspace: '.length).split(' — ')[0]!);
          if (line.includes('claude ▸ working')) controller.abort();
        },
      }),
    ).rejects.toThrow('claude stopped');
    expect(controller.signal.aborted).toBe(true);
  });
});
