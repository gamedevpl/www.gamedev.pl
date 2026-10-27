import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api.js';
import { updateKit } from './kit-update.js';
import { playAppTools, type PlayToolsInput } from './play-tools.js';

vi.mock('./kit-update.js', () => ({ updateKit: vi.fn() }));

function tools(overrides: Partial<PlayToolsInput> = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const api: ApiClient = {
    origin: 'https://gamedev.test',
    request: async <T>(method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (path.endsWith('/turn')) return { kind: 'build', roundId: 7, ack: 'on it' } as T;
      if (path.endsWith('/sources/session')) return { locked: true, canTakeOver: true, jobId: 1, generation: 1 } as T;
      throw new Error(`unexpected ${method} ${path}`);
    },
    requestBytes: async () => Buffer.alloc(0),
  };
  const list = playAppTools({
    api,
    token: 'tok',
    slug: 'snake',
    root: mkdtempSync(join(tmpdir(), 'play-tools-')),
    abort: () => new AbortController().signal,
    preview: async () => 'http://127.0.0.1:5173/',
    capture: async () => undefined,
    write: () => {},
    pollMs: 1,
    ...overrides,
  });
  const tool = (name: string) => list.find((candidate) => candidate.name === name)!;
  return { list, tool, calls };
}

describe('playAppTools', () => {
  it('serves the delivery steps as write tools and the rest as read tools', () => {
    const { list } = tools();
    expect(list.map((tool) => [tool.name, tool.write === true])).toEqual([
      ['game_round', false],
      ['game_kit_update', true],
      ['game_verify', false],
      ['game_preview', false],
      ['game_capture', false],
      ['game_diff', false],
      ['game_submit', true],
      ['game_publish', true],
    ]);
  });

  it.each([false, true])('invalidates preview and capture state after Kit setup (failure: %s)', async (fail) => {
    vi.mocked(updateKit).mockImplementation(async () => {
      if (fail) throw Error('setup failed');
    });
    const resetPreview = vi.fn(async () => {});
    const writer = vi.fn(async (run: () => Promise<void>) => run());
    const { tool } = tools({ resetPreview, writer });
    const action = tool('game_kit_update').run({});
    if (fail) await expect(action).rejects.toThrow('setup failed');
    else await action;
    expect(writer).toHaveBeenCalledOnce();
    expect(resetPreview).toHaveBeenCalledOnce();
  });

  it('opens a round on the platform with the creator request', async () => {
    const { tool, calls } = tools();
    expect(await tool('game_round').run({ request: ' make the snake faster ' })).toBe(
      'Round 7 is open. Platform note: on it',
    );
    expect(calls).toEqual([
      { method: 'POST', path: '/api/submissions/tok/turn', body: { text: 'make the snake faster' } },
    ]);
  });

  it('reports green and red checks', async () => {
    let status = 0;
    const run = () => ({ status, stderr: status ? 'src/main.ts(3,1): error TS2304' : '' });
    const { tool } = tools({ run });
    expect(await tool('game_verify').run({})).toBe('Checks are green: typecheck, check:static.');
    status = 2;
    expect(await tool('game_verify').run({})).toBe('Checks failed at typecheck:\nsrc/main.ts(3,1): error TS2304');
  });

  it('hands the preview URL to the agent', async () => {
    expect(await tools().tool('game_preview').run({})).toBe('Live preview: http://127.0.0.1:5173/');
    expect(
      await tools({ preview: async () => undefined })
        .tool('game_preview')
        .run({}),
    ).toBe('No live preview is available for this game.');
  });

  it('waits for the capture and returns its PNG', async () => {
    const requests: unknown[] = [];
    const replies = [
      { content: [{ type: 'text', text: JSON.stringify({ jobId: 'j1', state: 'building' }) }] },
      { content: [{ type: 'text', text: JSON.stringify({ jobId: 'j1', state: 'capturing' }) }] },
      {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ jobId: 'j1', state: 'complete', revision: 'abc', consoleErrors: [] }),
          },
          { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
        ],
      },
    ];
    const fetch = (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return { json: async () => ({ jsonrpc: '2.0', id: 1, result: replies.shift() }) };
    }) as unknown as typeof globalThis.fetch;
    const { tool } = tools({
      fetch,
      capture: async () => ({ url: 'http://127.0.0.1:1/mcp', authorization: 'Bearer k' }),
    });
    expect(await tool('game_capture').run({ viewport: 'mobile' })).toEqual({
      text: JSON.stringify({ state: 'complete', revision: 'abc', consoleErrors: [] }),
      images: [{ mimeType: 'image/png', data: 'iVBORw0KGgo=' }],
    });
    expect(requests.map((request) => (request as { params: unknown }).params)).toEqual([
      { name: 'capture_game', arguments: { viewport: 'mobile' } },
      { name: 'capture_status', arguments: { jobId: 'j1' } },
      { name: 'capture_status', arguments: { jobId: 'j1' } },
    ]);
  });

  it('tells the agent when capture is unavailable or fails', async () => {
    expect(await tools().tool('game_capture').run({})).toBe(
      'Local capture is not available: no live preview is running.',
    );
    const fetch = (async () => ({
      json: async () => ({
        result: {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: 'A capture is already running.' }) }],
        },
      }),
    })) as unknown as typeof globalThis.fetch;
    const failing = tools({
      fetch,
      capture: async () => ({ url: 'http://127.0.0.1:1/mcp', authorization: 'Bearer k' }),
    });
    expect(await failing.tool('game_capture').run({})).toBe('Capture failed: A capture is already running.');
  });

  it('refuses delivery while another agent session holds the game', async () => {
    const { tool } = tools();
    await expect(tool('game_submit').run({})).rejects.toThrow(/job 1, generation 1/);
    await expect(tool('game_submit').run({})).rejects.toThrow(/Studio.*push --takeover/);
  });
});
