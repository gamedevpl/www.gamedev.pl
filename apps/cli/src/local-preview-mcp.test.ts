import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { startLocalPreviewMcp } from './local-preview-mcp.js';
import { capturePage, previewSource } from './local-preview-source.js';
import { localPreviewAdapter } from './local-preview-adapter.js';
import { readFileSync, existsSync } from 'node:fs';
import type { AdapterSpec } from './adapters.js';

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const controller = new AbortController();
  const state = { html: '<h1>Current game</h1>', busy: false, stale: false, error: '' };
  const revision = () => createHash('sha256').update(state.html).digest('hex');
  const server = createServer((request, response) => {
    if (request.url?.endsWith('/status')) response.end(JSON.stringify({ ...state, revision: revision() }));
    else response.end(state.html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => {
    controller.abort();
    server.closeAllConnections();
    server.close();
  });
  const previewUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${'a'.repeat(48)}/`;
  return { state, revision, controller, previewUrl };
}
async function bridge() {
  const f = await fixture();
  const capture = vi.fn(async ({ url }: { url: string }) => {
    const response = await fetch(url);
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'");
    expect(await response.text()).toContain('sandbox="allow-scripts allow-pointer-lock"');
    return { png: 'test-png', errors: ['test console error'] };
  });
  const mcp = await startLocalPreviewMcp({ ...f, abort: f.controller.signal, write: vi.fn(), capture });
  cleanup.push(() => mcp.close());
  const rpc = async (method: string, params = {}, extra: Record<string, string> = {}) => {
    const response = await fetch(mcp.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: mcp.authorization,
        ...extra,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return { response, data: response.headers.get('content-type')?.includes('json') ? await response.json() : null };
  };
  return { ...f, mcp, capture, rpc };
}
it('captures a fixed game snapshot and returns an image with the actual rendered revision', async () => {
  const f = await bridge();
  expect((await f.rpc('initialize')).data.result.capabilities).toEqual({ tools: {} });
  expect((await f.rpc('tools/list')).data.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
    'preview_status',
    'capture',
    'capture_status',
  ]);
  const started = (await f.rpc('tools/call', { name: 'capture', arguments: {} })).data.result;
  const { jobId } = JSON.parse(started.content[0].text);
  await vi.waitFor(() => expect(f.capture).toHaveBeenCalledOnce());
  const result = await vi.waitFor(async () => {
    const data = (await f.rpc('tools/call', { name: 'capture_status', arguments: { jobId } })).data.result;
    expect(JSON.parse(data.content[0].text).state).toBe('complete');
    return data;
  });
  expect(JSON.parse(result.content[0].text).revision).toBe(f.revision());
  expect(result.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
  expect(JSON.parse(result.content[0].text).consoleErrors).toEqual(['test console error']);
});
it('rejects cross-origin, unauthenticated, arbitrary URL and shell requests', async () => {
  const f = await bridge();
  expect((await f.rpc('tools/list', {}, { Authorization: 'Bearer wrong' })).response.status).toBe(403);
  expect((await f.rpc('tools/list', {}, { Origin: 'https://evil.test' })).response.status).toBe(403);
  for (const request of [
    { name: 'capture', arguments: { url: 'file:///etc/passwd' } },
    { name: 'capture', arguments: { viewport: 'huge' } },
    { name: 'shell', arguments: { command: 'echo hi' } },
    { name: 'capture_status', arguments: { jobId: '../../secret' } },
  ])
    expect((await f.rpc('tools/call', request)).data.result.isError).toBe(true);
  expect(f.capture).not.toHaveBeenCalled();
  const oversized = await fetch(f.mcp.url, {
    method: 'POST',
    headers: { Authorization: f.mcp.authorization, 'Content-Type': 'application/json' },
    body: 'x'.repeat(9000),
  });
  expect(oversized.status).toBe(400);
});
it('waits for fresh builds and cancels without launching the browser', async () => {
  const f = await bridge();
  f.state.stale = true;
  const data = (await f.rpc('tools/call', { name: 'capture' })).data.result;
  expect(JSON.parse(data.content[0].text).state).toBe('building');
  await f.mcp.close();
  expect(f.capture).not.toHaveBeenCalled();
  await expect(fetch(f.mcp.url)).rejects.toThrow();
});
it('does not capture a failed build or let a game escape srcdoc', async () => {
  const f = await fixture();
  f.state.error = 'Invalid source';
  await expect(previewSource(f.previewUrl, f.controller.signal).snapshot()).rejects.toThrow('Invalid source');
  expect(() => previewSource('http://example.com/', f.controller.signal)).toThrow();
  const page = capturePage('</script><script>bad()</script>');
  expect(page).not.toContain('</script><script>bad');
  expect(page).not.toContain('allow-same-origin');
  expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
});
it.each(['codex', 'claude', 'copilot'])('adds ephemeral MCP configuration for %s', (name) => {
  const original = { name, headless: ['exec'], command: name } as AdapterSpec;
  const endpoint = { url: 'http://127.0.0.1:12345/mcp', authorization: 'Bearer test-secret' };
  const wired = localPreviewAdapter(original, endpoint);
  expect(original.headless).toEqual(['exec']);
  if (name === 'codex') expect(wired.spec.headless.join(' ')).toContain('mcp_servers.gamedevpl_local.url=');
  else {
    const arg = wired.spec.headless[1]!.replace(/^@/, '');
    expect(readFileSync(arg, 'utf8')).toContain('gamedevpl_local');
    wired.cleanup();
    expect(existsSync(arg)).toBe(false);
  }
  wired.cleanup();
});
