import { expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPermissionTask } from './permission-task.js';
import { loadAdapters } from './adapters.js';
import { AUTO_RESUME } from './agent-approval.js';
import { setPermissionMode } from './agent-permissions.js';
import { taskOutput } from './task-output.js';
import type { Workshop } from './workshop.js';

it('restarts actual subprocesses and routes resumed approvals through a fresh sandboxed MCP server', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-auto-process-'));
  const script = join(root, 'claude-fixture.cjs');
  writeFileSync(
    script,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const resumed = args.includes('--resume');
const config = JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config') + 1], 'utf8'));
const server = config.mcpServers.gamedevpl_local;
const rpc = async (tool_name, input) => {
  const response = await fetch(server.url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...server.headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
      name: 'approve', arguments: { tool_name, input, tool_use_id: 'tool-1' }
    } })
  });
  const data = await response.json();
  return JSON.parse(data.result.content[0].text).behavior;
};
process.on('SIGTERM', () => {
  setTimeout(() => { fs.writeFileSync('stopped', 'yes'); process.exit(0); }, 50);
});
(async () => {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'session-kept' }));
  if (!resumed) {
    fs.writeFileSync('game.ts', 'partial');
    await rpc('Bash', { command: 'npm test' });
    setInterval(() => {}, 1000);
    return;
  }
  if (args[args.indexOf('--resume') + 1] !== 'session-kept') throw new Error('wrong conversation');
  if (fs.readFileSync('stopped', 'utf8') !== 'yes') throw new Error('old process still running');
  if (fs.readFileSync('game.ts', 'utf8') !== 'partial') throw new Error('edits lost');
  const settings = args.filter((value, index) => args[index - 1] === '--settings').map(value => JSON.parse(value));
  const sandbox = settings.find(value => value.sandbox)?.sandbox;
  if (!sandbox?.enabled || !sandbox.failIfUnavailable || sandbox.allowUnsandboxedCommands) throw new Error('missing sandbox');
  if (await rpc('Read', { file_path: process.cwd() + '/game.ts' }) !== 'allow') throw new Error('not auto');
  if (await rpc('Bash', { command: 'npm test', dangerouslyDisableSandbox: true }) !== 'deny') throw new Error('sandbox escaped');
  fs.writeFileSync('game.ts', 'finished');
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Done' }));
})().catch(error => { console.error(error.message); if (resumed) process.exit(1); else setInterval(() => {}, 1000); });
`,
  );
  chmodSync(script, 0o755);
  const spec = { ...loadAdapters().adapters.find((row) => row.name === 'claude')!, command: script };
  const pick = vi.fn(async () => AUTO_RESUME);
  const write = vi.fn();
  const abort = new AbortController();
  const ws: Workshop = {
    root,
    slug: 'test',
    token: 'tok',
    env: process.env,
    adapters: [spec],
    builder: 'self',
    pick,
    abort: { current: abort },
  };
  try {
    const result = await runPermissionTask({
      ws,
      permissionState: { mode: 'ask' },
      spec,
      cwd: root,
      prompt: 'Fix game',
      authCheck: Promise.resolve(),
      abort: abort.signal,
      write,
      output: taskOutput(write),
      onRestart: vi.fn(),
      onLine: (line) => write(line),
    });
    expect(result, JSON.stringify(write.mock.calls)).toEqual({ code: 0 });
    expect(pick).toHaveBeenCalledOnce();
    expect(readFileSync(join(root, 'game.ts'), 'utf8')).toBe('finished');
  } finally {
    abort.abort();
    setPermissionMode('ask');
    rmSync(root, { recursive: true, force: true });
  }
}, 10_000);
