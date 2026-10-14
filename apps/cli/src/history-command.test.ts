import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HistoryVersion, HistorySourceFile } from '@gamedevpl/contract';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { historyCommand, isHistoryVerb } from './history-command.js';
import { readHistory, readHistoryTree } from './history-api.js';
import { handleReplLine } from './repl.js';
import { runCli } from './main.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'gamedev-command-test-'));
  dirs.push(cwd);
  const versions: HistoryVersion[] = [2, 1].map((n) => ({
    version: `v${n}`,
    createdAt: `2026-10-0${n}T00:00:00Z`,
    jobId: n,
    sourceFiles: ['game.ts'],
    verdict: 'passed',
    summary: `Change ${n}`,
    backend: 'self',
    deliveryMode: 'preview',
  }));
  const trees: Record<string, HistorySourceFile[]> = {
    v1: [{ path: 'game.ts', content: 'const a = 1;\nconst b = 2;\n' }],
    v2: [{ path: 'game.ts', content: 'const a = 1;\nconst b = 3;\n' }],
  };
  const calls: string[] = [];
  const api = createApi({
    origin: 'https://example.invalid',
    store: memoryStore({ accessToken: 'fixture', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url) => {
      const parsed = new URL(String(url));
      calls.push(parsed.pathname + parsed.search);
      if (parsed.pathname.endsWith('/versions')) {
        const cursor = parsed.searchParams.get('cursor');
        const rows = versions.filter((row) => !cursor || row.version < cursor).slice(0, 1);
        const hasMore = rows.length > 0 && rows[0]!.version !== 'v1';
        return Response.json({ slug: 'probe', versions: rows, hasMore, nextCursor: hasMore ? rows[0]!.version : null });
      }
      const version = parsed.pathname.split('/').at(-2)!;
      if (trees[version])
        return Response.json({
          slug: 'probe',
          version,
          metadata: versions.find((row) => row.version === version),
          files: trees[version],
        });
      return Response.json({ error: 'no such version' }, { status: 404 });
    },
  });
  const run = async (verb: string, args: string[], flags: Record<string, string | boolean> = {}) => {
    const output: string[] = [];
    await historyCommand({
      verb,
      args,
      flags: { slug: 'probe', ...flags },
      api,
      cwd,
      write: (text) => output.push(text),
    });
    return output.join('\n');
  };
  return { cwd, versions, trees, calls, api, run };
}

describe('platform history commands without a local Git repository', () => {
  it('log follows pagination and shows summaries and verdicts; --limit bounds the request', async () => {
    const f = fixture();
    const log = await f.run('log', [], { all: true });
    expect(log).toContain('v2');
    expect(log).toContain('v1');
    expect(log).toContain('Change 2');
    expect(log).toContain('passed');
    expect(f.calls).toContain('/api/me/studio/games/probe/versions?limit=100&cursor=v2');
    f.calls.length = 0;
    const limited = JSON.parse(await f.run('log', [], { limit: '1', json: true }));
    expect(limited.versions).toHaveLength(1);
    expect(f.calls).toHaveLength(1);
  });
  it('show compares to the preceding delivery and treats the first version as additions', async () => {
    const f = fixture();
    const shown = JSON.parse(await f.run('show', ['v2'], { json: true }));
    expect(shown.parent).toBe('v1');
    expect(shown.metadata.summary).toBe('Change 2');
    expect(shown.patch).toContain('-const b = 2;');
    expect(shown.patch).toContain('+const b = 3;');
    const first = JSON.parse(await f.run('show', ['v1'], { json: true }));
    expect(first.parent).toBeNull();
    expect(first.patch).toContain('+const a = 1;');
  });
  it('diff compares in either direction without changing a checkout', async () => {
    const f = fixture();
    expect(await f.run('diff', ['v1', 'v2'])).toContain('+const b = 3;');
    expect(await f.run('diff', [], { from: 'v2', to: 'v1' })).toContain('+const b = 2;');
    expect(isHistoryVerb('diff', ['probe', './directory'], {})).toBe(false);
  });
  it('blame assigns each line to its version and can target an older version', async () => {
    const f = fixture();
    const result = JSON.parse(await f.run('blame', ['game.ts'], { json: true }));
    expect(result.lines.map((line: { version: string }) => line.version)).toEqual(['v1', 'v2']);
    const old = JSON.parse(await f.run('blame', ['games/probe/game.ts'], { version: 'v1', json: true }));
    expect(old.lines.map((line: { version: string }) => line.version)).toEqual(['v1', 'v1']);
  });
  it('blame refuses missing or binary sources and unsafe paths', async () => {
    const f = fixture();
    await expect(f.run('blame', ['missing.ts'])).rejects.toThrow('file not found');
    f.trees.v2![0] = { path: 'game.ts', content: Buffer.from([0, 255]).toString('base64'), encoding: 'base64' };
    await expect(f.run('blame', ['game.ts'])).rejects.toThrow('text source');
    await expect(f.run('blame', ['../game.ts'])).rejects.toThrow('invalid source path');
  });
  it('infers the game from a checkout subdirectory and strips terminal controls only from human output', async () => {
    const f = fixture();
    writeFileSync(join(f.cwd, '.gamedev-slug'), 'probe');
    mkdirSync(join(f.cwd, 'sub'));
    f.versions[0]!.summary = 'Hello\u001b[31m red';
    const output: string[] = [];
    await historyCommand({
      verb: 'log',
      args: [],
      flags: {},
      api: f.api,
      cwd: join(f.cwd, 'sub'),
      write: (text) => output.push(text),
    });
    expect(output.join('')).toContain('Hello red');
    expect(output.join('')).not.toContain('\u001b');
    expect(JSON.parse(await f.run('log', [], { json: true })).versions[0].summary).toContain('\u001b');
  });
  it('rejects a repeated page cursor instead of looping forever', async () => {
    const f = fixture();
    f.api.request = async <T>() => ({ versions: f.versions, hasMore: true, nextCursor: 'v2' }) as T;
    await expect(readHistory(f.api, 'probe')).rejects.toThrow('invalid history pagination');
  });

  it('refuses a legacy capped response rather than claiming it is complete history', async () => {
    const f = fixture();
    f.api.request = async <T>() => ({ versions: f.versions }) as T;
    await expect(readHistory(f.api, 'probe')).rejects.toThrow('update the platform API');
  });

  it('routes shell and slash commands to the history API and preserves --version for blame', async () => {
    const f = fixture();
    const originalFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const data = await f.api.request('GET', parsed.pathname + parsed.search);
      expect(init?.method).toBe('GET');
      return Response.json(data);
    });
    vi.stubGlobal('fetch', originalFetch);
    try {
      const chunks: string[] = [];
      const io = {
        stdin: { isTTY: false },
        stdout: {
          write: (s: string) => {
            chunks.push(s);
            return true;
          },
          isTTY: false,
        },
        stderr: { write: () => true },
      } as unknown as Parameters<typeof runCli>[2];
      expect(await runCli(['node', 'gamedevpl', 'log', 'probe', '--json'], { GAMEDEV_TOKEN: 'fixture' }, io)).toBe(0);
      expect(JSON.parse(chunks.join('')).versions).toHaveLength(2);
      chunks.length = 0;
      expect(
        await runCli(
          ['node', 'gamedevpl', 'blame', 'game.ts', '--slug', 'probe', '--version', 'v1', '--json'],
          { GAMEDEV_TOKEN: 'fixture' },
          io,
        ),
      ).toBe(0);
      expect(JSON.parse(chunks.join('')).version).toBe('v1');
      chunks.length = 0;
      await handleReplLine({
        line: '/diff v1 v2 --slug probe',
        api: f.api,
        token: null,
        cwd: f.cwd,
        write: (text) => chunks.push(text),
      });
      expect(chunks.join('')).toContain('+const b = 3;');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('honors Retry-After on history reads, without retrying authorization failures', async () => {
    const f = fixture();
    let attempts = 0;
    const api = createApi({
      origin: f.api.origin,
      store: memoryStore({ accessToken: 'fixture', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () =>
        ++attempts === 1
          ? Response.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'retry-after': '2' } })
          : Response.json({ files: [], metadata: f.versions.find((row) => row.version === 'v1') }),
    });
    vi.useFakeTimers();
    try {
      const read = readHistoryTree(api, 'probe', 'v1');
      await vi.advanceTimersByTimeAsync(1999);
      expect(attempts).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await read).toMatchObject({ files: [] });
      expect(attempts).toBe(2);
      const denied = createApi({
        origin: f.api.origin,
        env: { GAMEDEV_TOKEN: 'fixture' },
        store: memoryStore(null),
        fetch: async () => {
          attempts++;
          return Response.json({ error: 'authentication required' }, { status: 401 });
        },
      });
      await expect(readHistoryTree(denied, 'probe', 'v1')).rejects.toThrow('expired');
      expect(attempts).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
