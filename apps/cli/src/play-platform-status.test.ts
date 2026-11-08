import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { AgentResult, AgentTask, CodingAgent } from 'genaicode/agents';
import { createApi } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { startPlayBrain, type PlayBrain } from './play-brain.js';
import type { Workshop } from './workshop.js';

type ToolReply = { isError?: boolean; content: Array<{ text: string }> };

async function callTool(task: AgentTask, name: string): Promise<ToolReply> {
  const server = task.mcpServers![0] as { url: string; headers?: Record<string, string> };
  const response = await fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...server.headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }),
  });
  expect(response.ok).toBe(true);
  return ((await response.json()) as { result: ToolReply }).result;
}

it.each(['incoming', 'conflict', 'host error', 'transport error'])(
  'checks Studio through real Play MCP with host credentials: %s',
  async (scenario) => {
    const root = mkdtempSync(join(tmpdir(), 'play-platform-status-'));
    const base = [{ path: 'game.ts', content: 'export const speed = 1;\n' }];
    const local = scenario === 'conflict' ? [{ path: 'game.ts', content: 'export const speed = 3;\n' }] : base;
    writeGameFiles(root, 'snake', local);
    writeBase(root, 'v1', base);
    writeFileSync(join(root, '.gamedev-slug'), 'snake');
    const originalBase = readFileSync(join(root, '.gamedev-base.json'), 'utf8');
    const replies: ToolReply[] = [];
    const requests: string[] = [];
    const api = createApi({
      origin: 'https://gamedev.test',
      store: memoryStore({ accessToken: 'host-only-token', tokenType: 'Bearer', scope: 'creator' }),
      env: {},
      fetch: async (url, init) => {
        expect(init?.method).toBe('GET');
        expect((init?.headers as Record<string, string>).authorization).toBe('Bearer host-only-token');
        requests.push(url);
        if (scenario === 'host error') throw new TypeError('Invalid URL');
        if (scenario === 'transport error')
          throw new TypeError('fetch failed', {
            cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
          });
        if (url.endsWith('/versions'))
          return Response.json({ versions: [{ version: 'v2', createdAt: '2026-11-08', sourceFiles: ['game.ts'] }] });
        expect(url).toBe('https://gamedev.test/api/me/studio/games/snake/versions/v2/tree');
        return Response.json({ version: 'v2', files: [{ path: 'game.ts', content: 'export const speed = 2;\n' }] });
      },
    });
    const agent: CodingAgent = {
      name: 'claude',
      command: process.execPath,
      capabilities: { resume: true, mcp: true, approvals: true },
      run(task) {
        const result = (async (): Promise<AgentResult> => {
          expect(task.prompt).toContain('For Studio synchronization status use game_status');
          expect(task.prompt).toContain('for source differences use game_diff');
          expect(task.prompt).toContain('call the matching MCP tool in this turn');
          expect(JSON.stringify(task.env)).not.toContain('host-only-token');
          replies.push(await callTool(task, 'game_status'), await callTool(task, 'game_diff'));
          return { status: 'completed', ok: true, exitCode: 0, signal: null, sessionId: 's1' };
        })();
        return {
          result,
          abort() {},
          async *[Symbol.asyncIterator]() {
            yield { type: 'session' as const, sessionId: 's1' };
            yield { type: 'done' as const, result: await result };
          },
        };
      },
    };
    const run = vi.fn(() => ({ status: 0, stderr: '' }));
    const prompt = vi.fn(async () => 'Deny');
    const ws: Workshop = {
      root,
      slug: 'snake',
      token: 'round-token',
      env: { XDG_CONFIG_HOME: root },
      adapters: [{ name: 'claude', command: 'claude', headless: [] }],
      builder: 'self',
      abort: { current: null },
      runAdapter: async () => ({ code: 0 }),
      run,
    };
    let brain: PlayBrain | undefined;
    try {
      brain = await startPlayBrain({
        api,
        ws,
        prompt,
        write: () => {},
        activity: () => {},
        agents: () => [agent],
        ready: async () => true,
      });
      await brain!.turn('Check whether Studio has newer sources and show the diff.');
      expect(replies).toHaveLength(2);
      const [status, diff] = replies.map((reply) => reply.content[0]!.text);
      if (scenario.endsWith('error')) {
        expect(replies.every((reply) => reply.isError)).toBe(true);
        const message = scenario === 'host error' ? 'Invalid URL' : 'network request failed (ECONNREFUSED)';
        expect(status).toContain(message);
        expect(diff).toContain(message);
        expect(`${status} ${diff}`).not.toMatch(/offline|proxy|sandbox/);
        expect(requests).toHaveLength(2);
      } else {
        expect(replies.every((reply) => !reply.isError)).toBe(true);
        expect(status).toContain('Platform version: v2');
        expect(status).toContain(scenario === 'conflict' ? 'both changed: game.ts' : 'incoming: modified: game.ts');
        expect(diff).toContain('-export const speed = 2;');
        expect(diff).toContain(scenario === 'conflict' ? '+export const speed = 3;' : '+export const speed = 1;');
        expect(requests).toHaveLength(4);
      }
      expect(prompt).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      expect(readFileSync(join(root, 'games/snake/game.ts'), 'utf8')).toBe(local[0]!.content);
      expect(readFileSync(join(root, '.gamedev-base.json'), 'utf8')).toBe(originalBase);
    } finally {
      await brain?.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
