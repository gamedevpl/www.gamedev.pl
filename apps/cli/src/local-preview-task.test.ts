import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { loadAdapters, type AdapterSpec } from './adapters.js';
import { runPermissionTask } from './permission-task.js';
import { taskOutput } from './task-output.js';
import type { Workshop } from './workshop.js';

const capture = vi.hoisted(() => vi.fn(async () => ({ png: 'host-png', errors: [] })));
vi.mock('./local-capture-browser.js', () => ({ captureBrowser: capture }));

function endpoint(spec: AdapterSpec) {
  const args = spec.headless;
  if (spec.name === 'codex') {
    const url = args.find((arg) => arg.startsWith('mcp_servers.gamedevpl_local.url='))!;
    const headers = args.find((arg) => arg.startsWith('mcp_servers.gamedevpl_local.http_headers='))!;
    return {
      url: JSON.parse(url.slice(url.indexOf('=') + 1)) as string,
      headers: { Authorization: JSON.parse(headers.match(/Authorization = ("[^"]+")/)![1]!) as string },
    };
  }
  const flag = spec.name === 'claude' ? '--mcp-config' : '--additional-mcp-config';
  const config = JSON.parse(readFileSync(args[args.indexOf(flag) + 1]!.replace(/^@/, ''), 'utf8'));
  return config.mcpServers.gamedevpl_local as { url: string; headers: Record<string, string> };
}

it.each(['codex', 'claude', 'copilot'])('connects host capture to a delegated %s task', async (name) => {
  capture.mockClear();
  const root = mkdtempSync(join(tmpdir(), 'gdpl-capture-task-'));
  const abort = new AbortController();
  const html = '<h1>Current checkout</h1>';
  const revision = createHash('sha256').update(html).digest('hex');
  const preview = createServer((request, response) => {
    response.end(request.url === '/status' ? JSON.stringify({ revision, busy: false, stale: false, error: '' }) : html);
  });
  preview.listen(0, '127.0.0.1');
  await once(preview, 'listening');
  const address = preview.address();
  if (!address || typeof address === 'string') throw new Error('No preview listener');
  const spec = loadAdapters().adapters.find((item) => item.name === name)!;
  const write = vi.fn();
  let connected: ReturnType<typeof endpoint> | undefined;
  const ws: Workshop = {
    root,
    slug: 'current-game',
    token: '',
    env: {},
    adapters: [spec],
    builder: 'self',
    pick: vi.fn(),
    abort: { current: abort },
    runAdapter: async (run) => {
      connected = endpoint(run.spec);
      expect(run.prompt).toContain('capture_game');
      expect(run.prompt).toContain('listen EPERM');
      expect(run.permissions).toEqual(
        name === 'copilot' ? undefined : { approval: 'auto-approve', sandbox: 'workspace-write' },
      );
      const rpc = async (method: string, params = {}) => {
        const response = await fetch(connected!.url, {
          method: 'POST',
          headers: { ...connected!.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        expect(response.ok).toBe(true);
        return (await response.json()).result;
      };
      const tools = await rpc('tools/list');
      expect(tools.tools.map((item: { name: string }) => item.name)).toContain('capture_game');
      const started = await rpc('tools/call', { name: 'capture_game', arguments: {} });
      const { jobId } = JSON.parse(started.content[0].text);
      await vi.waitFor(async () => {
        const result = await rpc('tools/call', { name: 'capture_status', arguments: { jobId } });
        expect(JSON.parse(result.content[0].text)).toMatchObject({ state: 'complete', revision });
        expect(result.content[1]).toEqual({ type: 'image', mimeType: 'image/png', data: 'host-png' });
      });
      return { code: 0 };
    },
  };
  try {
    expect(
      await runPermissionTask({
        ws,
        spec,
        permissionState: { mode: name === 'copilot' ? 'ask' : 'auto' },
        cwd: root,
        previewUrl: `http://127.0.0.1:${address.port}/`,
        prompt: 'Capture the game',
        abort: abort.signal,
        write,
        output: taskOutput(write),
        onRestart: vi.fn(),
      }),
    ).toEqual({ code: 0 });
    expect(capture).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(expect.stringContaining('preview_status, capture_game, capture_status'));
    expect(ws.pick).not.toHaveBeenCalled();
    await expect(fetch(connected!.url)).rejects.toThrow();
  } finally {
    abort.abort();
    preview.closeAllConnections();
    preview.close();
    rmSync(root, { recursive: true, force: true });
  }
});
