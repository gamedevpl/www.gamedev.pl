import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { AgentTask, CodingAgent } from 'genaicode/agents';
import { writeGameFiles } from './checkout.js';
import { startPlayBrain } from './play-brain.js';
import type { ApiClient } from './api.js';
import type { Workshop } from './workshop.js';
import type { localActivity } from './local-activity.js';

it('moves the activity heartbeat to the new improvement during the same agent turn', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-presence-round-'));
  writeGameFiles(root, 'airtime', [{ path: 'game.ts', content: 'export const x = 1;' }]);
  const ws = {
    slug: 'airtime',
    root,
    token: 'old',
    builder: 'platform',
    env: {},
    adapters: [{ name: 'claude', command: 'claude' }],
    pick: async () => '',
    abort: { current: null },
    runAdapter: async () => ({ code: 0 }),
  } as Workshop;
  const events: string[] = [];
  const trackPresence: typeof localActivity = (_api, token) => {
    events.push(`start:${token}`);
    return {
      phase: (phase) => events.push(`${phase}:${token}`),
      finish: async (phase) => {
        events.push(`${phase}:${token}`);
      },
    };
  };
  const agent: CodingAgent = {
    name: 'claude',
    command: process.execPath,
    capabilities: { resume: true, mcp: true, approvals: true },
    run(task: AgentTask) {
      const done = (async () => {
        const server = task.mcpServers![0] as { url: string; headers?: Record<string, string> };
        const response = await fetch(server.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...server.headers },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'game_round', arguments: { request: 'fix the jump' } },
          }),
        });
        const body = (await response.json()) as { result?: { isError?: boolean } };
        if (!body.result || body.result.isError) throw Error('game_round failed');
        return { status: 'completed' as const, ok: true, exitCode: 0, signal: null, sessionId: 's1' };
      })();
      return {
        result: done,
        abort() {},
        async *[Symbol.asyncIterator]() {
          const result = await done;
          yield { type: 'session' as const, sessionId: 's1' };
          yield { type: 'done' as const, result };
        },
      };
    },
  };
  const brain = await startPlayBrain({
    api: { origin: 'https://test.invalid', request: vi.fn() } as unknown as ApiClient,
    ws,
    prompt: async () => '',
    write: () => {},
    activity: () => {},
    agents: () => [agent],
    ready: async () => true,
    trackPresence,
    openRound: async () => {
      ws.token = 'new';
      ws.builder = 'self';
      return 'round opened';
    },
  });
  try {
    await brain!.turn('fix the jump');
    expect(events).toEqual(['start:old', 'editing:old', 'ready:old', 'start:new', 'editing:new', 'ready:new']);
  } finally {
    await brain?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
