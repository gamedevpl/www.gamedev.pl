import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../store/in-memory.js';
import { mintCreatorAgentKey } from './agent-creator-key.js';

it('the shipped stdio bridge reads account games through the real MCP server without opening a round', async () => {
  const secret = 'cli-plugin-integration-test-secret';
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:plugin', email: 'plugin@example.test', betaStatus: 'approved' });
  await store.ensureCreatorAgentKey('g:plugin', new Date().toISOString());
  const create = vi.spyOn(store, 'createSubmission');
  const app = await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubToken: 'fixture',
      submissionTokenSecret: secret,
      managedAvailabilityGate: null,
      githubClient: {
        getIssueState: async () => ({ state: 'open' }),
        findLinkedPR: async () => null,
        createIssueComment: async () => ({ id: 1 }),
        updateIssueBody: async () => {},
        closeIssue: async () => {},
        ensureOpenPullRequest: async () => ({ number: 1 }),
        deleteBranch: async () => {},
        getGameSources: async () => null,
        getGameMedia: async () => null,
        getCatalog: async () => [],
        getProgressNotes: async () => null,
      },
    },
  });
  const root = mkdtempSync(join(tmpdir(), 'cli-plugin-account-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const preload = join(root, 'fetch.mjs');
    writeFileSync(
      preload,
      `const real=fetch; globalThis.fetch=(url,init)=>{
      if(url!=='https://www.gamedev.pl/api/mcp') throw new Error('unexpected URL');
      return real(${JSON.stringify(`${origin}/api/mcp`)},init);
    };`,
    );
    const key = mintCreatorAgentKey(secret, { creatorUid: 'g:plugin', keyGeneration: 1 });
    child = spawn(
      process.execPath,
      ['--import', preload, fileURLToPath(new URL('../../../cli/src/plugin-bridge.mjs', import.meta.url))],
      {
        env: { ...process.env, GAMEDEV_CREATOR_KEY: key },
        stdio: 'pipe',
      },
    );
    let output = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const lines = createInterface({ input: child.stdout! });
    const pending = new Map<number, (reply: Record<string, unknown>) => void>();
    lines.on('line', (line) => {
      const reply = JSON.parse(line) as Record<string, unknown>;
      pending.get(Number(reply.id))?.(reply);
    });
    const call = (id: number, method: string, params: unknown) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`MCP request ${method} timed out`)), 10_000);
        pending.set(id, (reply) => {
          clearTimeout(timer);
          pending.delete(id);
          resolve(reply);
        });
        child!.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    expect(
      await call(1, 'initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'plugin-test', version: '1' },
      }),
    ).toHaveProperty('result');
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const tools = await call(2, 'tools/list', {});
    expect(JSON.stringify(tools)).toContain('list_account_games');
    const games = await call(3, 'tools/call', { name: 'list_account_games', arguments: {} });
    expect(games).toHaveProperty('result');
    const result = games.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain('games');
    expect(create).not.toHaveBeenCalled();
    expect(output).not.toContain(key);
  } finally {
    child?.kill();
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
