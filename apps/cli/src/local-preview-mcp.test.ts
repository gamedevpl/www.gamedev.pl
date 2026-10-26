import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_CAPTURES_PER_TASK, startLocalPreviewMcp } from './local-preview-mcp.js';
import { capturePage, previewSource } from './local-preview-source.js';
import { localPreviewAdapter } from './local-preview-adapter.js';
import { readFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
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
  const previewUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return { state, revision, controller, previewUrl };
}
async function bridge(captureBudget?: { used: number }, readCapturePlan?: () => unknown) {
  const f = await fixture();
  const capture = vi.fn(async ({ url }: { url: string }) => {
    const response = await fetch(url);
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'");
    expect(await response.text()).toContain('sandbox="allow-scripts allow-pointer-lock"');
    return { png: 'test-png', errors: ['test console error'] };
  });
  const mcp = await startLocalPreviewMcp({
    ...f,
    abort: f.controller.signal,
    write: vi.fn(),
    capture,
    captureBudget,
    readCapturePlan,
  });
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
    'report_progress',
    'game_journal',
    'game_journal_code',
    'game_journal_read',
    'game_observe',
    'game_take_control',
    'game_act',
    'game_release_control',
    'game_script_client',
    'preview_status',
    'capture_game',
    'capture_status',
  ]);
  const started = (await f.rpc('tools/call', { name: 'capture_game', arguments: { viewport: 'mobile' } })).data.result;
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
  expect(f.capture).toHaveBeenCalledWith(expect.objectContaining({ viewport: 'mobile' }));
});

it('validates marks and inline actions before spending the shared capture budget', async () => {
  const budget = { used: 0 };
  const f = await bridge(budget, () => ({ seed: 42, script: [{ capture: 'opening' }] }));
  const typo = (await f.rpc('tools/call', { name: 'capture_game', arguments: { mark: 'typo' } })).data.result;
  expect(typo.isError).toBe(true);
  expect(typo.content[0].text).toContain('Available: opening');
  const invalid = (
    await f.rpc('tools/call', { name: 'capture_game', arguments: { plan: { script: [{ eval: 'exec()' }] } } })
  ).data.result;
  expect(invalid.isError).toBe(true);
  expect(budget.used).toBe(0);
  expect(f.capture).not.toHaveBeenCalled();
  const started = (await f.rpc('tools/call', { name: 'capture_game', arguments: { mark: 'opening' } })).data.result;
  const { jobId } = JSON.parse(started.content[0].text);
  const status = await vi.waitFor(async () => {
    const result = (await f.rpc('tools/call', { name: 'capture_status', arguments: { jobId } })).data.result;
    const value = JSON.parse(result.content[0].text);
    expect(value.state).toBe('complete');
    return value;
  });
  expect(status.scenario).toMatchObject({
    source: 'CAPTURE.json',
    mark: 'opening',
    seed: 42,
    hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(f.capture).toHaveBeenCalledWith(
    expect.objectContaining({ gameUrl: expect.stringMatching(/\/game\?capture=1&seed=42$/) }),
  );
});
it('rejects cross-origin, unauthenticated, arbitrary URL and shell requests', async () => {
  const f = await bridge();
  expect((await f.rpc('tools/list', {}, { Authorization: 'Bearer wrong' })).response.status).toBe(403);
  expect((await f.rpc('tools/list', {}, { Origin: 'https://evil.test' })).response.status).toBe(403);
  for (const request of [
    { name: 'capture', arguments: { url: 'file:///etc/passwd' } },
    { name: 'capture_game', arguments: { url: 'http://127.0.0.1:1234/' } },
    { name: 'capture_game', arguments: { command: 'npm run capture' } },
    { name: 'capture_game', arguments: { game: '../other-game' } },
    { name: 'capture', arguments: { viewport: 'huge' } },
    { name: 'shell', arguments: { command: 'echo hi' } },
    { name: 'capture_status', arguments: { jobId: '../../secret' } },
  ])
    expect((await f.rpc('tools/call', request)).data.result.isError).toBe(true);
  expect(f.capture).not.toHaveBeenCalled();
  const oversized = await fetch(f.mcp.url, {
    method: 'POST',
    headers: { Authorization: f.mcp.authorization, 'Content-Type': 'application/json' },
    body: 'x'.repeat(66_000),
  });
  expect(oversized.status).toBe(400);
});
it('refuses captures past the per-task budget, not counting cooldown refusals', async () => {
  const f = await bridge();
  let clock = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  cleanup.push(() => vi.restoreAllMocks());
  for (let i = 0; i < MAX_CAPTURES_PER_TASK; i++) {
    clock += 3000;
    const started = (await f.rpc('tools/call', { name: 'capture', arguments: {} })).data.result;
    expect(started.isError).toBeFalsy();
    const { jobId } = JSON.parse(started.content[0].text);
    await vi.waitFor(async () => {
      const data = (await f.rpc('tools/call', { name: 'capture_status', arguments: { jobId } })).data.result;
      expect(JSON.parse(data.content[0].text).state).toBe('complete');
    });
    const tooSoon = (await f.rpc('tools/call', { name: 'capture', arguments: {} })).data.result;
    expect(tooSoon.content[0].text).toContain(i < MAX_CAPTURES_PER_TASK - 1 ? 'Wait two seconds' : 'used its');
  }
  clock += 3000;
  const refused = (await f.rpc('tools/call', { name: 'capture', arguments: {} })).data.result;
  expect(refused.isError).toBe(true);
  expect(refused.content[0].text).toContain(`used its ${MAX_CAPTURES_PER_TASK} captures`);
  expect(f.capture).toHaveBeenCalledTimes(MAX_CAPTURES_PER_TASK);
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
it('reports a failed host capture without returning an image or changing shell permissions', async () => {
  const f = await bridge();
  f.capture.mockRejectedValueOnce(new Error('Host browser unavailable'));
  const started = (await f.rpc('tools/call', { name: 'capture_game', arguments: {} })).data.result;
  const { jobId } = JSON.parse(started.content[0].text);
  await vi.waitFor(async () => {
    const result = (await f.rpc('tools/call', { name: 'capture_status', arguments: { jobId } })).data.result;
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ state: 'failed', error: 'Host browser unavailable' });
  });
});
it('does not capture a failed build or let a game escape srcdoc', async () => {
  const f = await fixture();
  f.state.error = 'Invalid source';
  f.state.stale = true;
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

it('reports validated, deduplicated progress without requiring a preview', async () => {
  const progress = vi.fn();
  const mcp = await startLocalPreviewMcp({ abort: new AbortController().signal, write: vi.fn(), progress });
  cleanup.push(() => mcp.close());
  const rpc = async (method: string, params = {}) =>
    (
      await fetch(mcp.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: mcp.authorization },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
    ).json();
  expect((await rpc('tools/list')).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
    'report_progress',
  ]);
  for (let i = 0; i < 2; i++)
    await rpc('tools/call', { name: 'report_progress', arguments: { stage: 'editing', summary: 'Adding ramps' } });
  expect(progress).toHaveBeenCalledExactlyOnceWith('editing: Adding ramps', false);
  for (const args of [
    { stage: 'done', summary: 'Published' },
    { stage: 'editing', summary: 'x'.repeat(241) },
    { stage: 'editing', summary: '\u001b[2J' },
  ])
    expect((await rpc('tools/call', { name: 'report_progress', arguments: args })).result.isError).toBe(true);
  expect((await rpc('tools/call', { name: 'capture' })).result.isError).toBe(true);
  expect(progress).toHaveBeenCalledTimes(1);
});

it('retains the capture budget after an approval server is replaced', async () => {
  const budget = { used: MAX_CAPTURES_PER_TASK - 1 };
  const first = await bridge(budget);
  const started = (await first.rpc('tools/call', { name: 'capture', arguments: {} })).data.result;
  expect(started.isError).toBeFalsy();
  expect(budget.used).toBe(MAX_CAPTURES_PER_TASK);
  await first.mcp.close();
  const resumed = await bridge(budget);
  const refused = (await resumed.rpc('tools/call', { name: 'capture', arguments: {} })).data.result;
  expect(refused.isError).toBe(true);
  expect(refused.content[0].text).toContain('used its');
  expect(resumed.capture).not.toHaveBeenCalled();
});

it.runIf(process.env.GAMEDEV_CAPTURE_BROWSER_TEST === '1')(
  'waits for a delayed GameKit renderer and returns painted pixels through capture_game',
  async () => {
    const f = await fixture();
    f.state.html = `<!doctype html><body style="margin:0;background:white"><canvas width="960" height="600"></canvas><script>
      window.__GAME_HARNESS__ = { ready: false };
      setTimeout(() => {
      const context = document.querySelector('canvas').getContext('2d');
      context.fillStyle = '#23aa77'; context.fillRect(0, 0, 960, 600);
      window.__GAME_HARNESS__.ready = true;
      console.error('MCP_CAPTURE_GAME_RENDERED ' + document.compatMode);
      }, 2300);
    </script></body>`;
    const mcp = await startLocalPreviewMcp({ previewUrl: f.previewUrl, abort: f.controller.signal, write: vi.fn() });
    cleanup.push(() => mcp.close());
    const rpc = async (name: string, args = {}) => {
      const response = await fetch(mcp.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: mcp.authorization },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      return (await response.json()).result;
    };
    const started = await rpc('capture_game');
    const { jobId } = JSON.parse(started.content[0].text);
    const result = await vi.waitFor(
      async () => {
        const result = await rpc('capture_status', { jobId });
        const status = JSON.parse(result.content[0].text);
        if (status.state === 'failed') throw new Error(status.error);
        expect(status.state).toBe('complete');
        return result;
      },
      { timeout: 45_000, interval: 250 },
    );
    const status = JSON.parse(result.content[0].text);
    expect(status.revision).toBe(f.revision());
    expect(status.consoleErrors.join(' ')).toContain('MCP_CAPTURE_GAME_RENDERED CSS1Compat');
    const png = Buffer.from(result.content[1].data, 'base64');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([960, 600]);
    const pixels = PNG.sync.read(png);
    const center = (Math.floor(pixels.height / 2) * pixels.width + Math.floor(pixels.width / 2)) * 4;
    expect([...pixels.data.subarray(center, center + 4)]).toEqual([35, 170, 119, 255]);
  },
  60_000,
);

const scenarioGame = `<!doctype html><body style="margin:0"><canvas id="game" width="960" height="600"></canvas><script>
  const query = new URLSearchParams(location.search);
  const seed = Number(query.get('seed'));
  const canvas = document.getElementById('game');
  const context = canvas.getContext('2d');
  let held = false, x = 0, frame = 0, clicks = 0;
  addEventListener('keydown', event => { if (event.key === 'ArrowRight') held = true; });
  addEventListener('keyup', () => { held = false; });
  canvas.addEventListener('click', () => { clicks++; });
  const h = window.__GAME_HARNESS__ = {
    ready: true, captureMode: query.get('capture') === '1', metadata: {},
    step(dt) { frame++; if (held) x++; h.paint(); },
    paint() { h.metadata = { frame, x, clicks, seed, targetX: 480, targetY: 300 };
      context.fillStyle = 'rgb(' + frame + ',' + x + ',' + seed + ')'; context.fillRect(0,0,960,600); }
  };
  h.paint();
</script></body>`;

it.runIf(process.env.GAMEDEV_CAPTURE_BROWSER_TEST === '1').each([
  {
    name: 'stored nested mark',
    args: { mark: 'view' },
    frame: 8,
    x: 5,
    seed: 42,
    source: 'CAPTURE.json',
    failure: false,
  },
  {
    name: 'inline final state',
    args: {
      viewport: 'mobile',
      plan: { seed: 17, script: [{ press: { key: 'ArrowRight', frames: 3 } }, { wait: 2 }] },
    },
    frame: 5,
    x: 3,
    seed: 17,
    source: 'inline',
    failure: false,
  },
  {
    name: 'inline selected mark',
    args: {
      mark: 'custom',
      plan: { seed: 13, script: [{ wait: 4 }, { capture: 'custom' }, { assert: { field: 'frame', equals: -1 } }] },
    },
    frame: 4,
    x: 0,
    seed: 13,
    source: 'inline',
    failure: false,
  },
  {
    name: 'failed assertion',
    args: { plan: { script: [{ assert: { field: 'frame', equals: 9 } }] } },
    frame: 0,
    x: 0,
    seed: 1,
    source: 'inline',
    failure: true,
  },
  {
    name: 'frame budget exhaustion',
    args: { plan: { maxFrames: 2, script: [{ wait: 3 }] } },
    frame: 0,
    x: 0,
    seed: 1,
    source: 'inline',
    failure: true,
  },
])(
  'replays $name through MCP and real sandboxed Chrome',
  async (test) => {
    const f = await fixture();
    f.state.html = scenarioGame;
    const mcp = await startLocalPreviewMcp({
      previewUrl: f.previewUrl,
      abort: f.controller.signal,
      write: vi.fn(),
      readCapturePlan: () => ({
        seed: 42,
        fps: 30,
        maxFrames: 30,
        script: [
          { tap: 'ArrowRight' },
          { repeat: { times: 2, actions: [{ press: { key: 'ArrowRight', frames: 2 } }] } },
          { click: { fromMetadata: { x: 'targetX', y: 'targetY' } } },
          { assert: { field: 'clicks', equals: 1 } },
          { waitFor: { field: 'frame', greaterThanOrEqual: 8, maxFrames: 5 } },
          { repeat: { times: 2, actions: [{ capture: 'view' }, { wait: 1 }] } },
          { assert: { field: 'frame', equals: -1 } },
        ],
      }),
    });
    cleanup.push(() => mcp.close());
    const rpc = async (name: string, args: unknown) => {
      const response = await fetch(mcp.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: mcp.authorization },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      return (await response.json()).result;
    };
    const started = await rpc('capture_game', test.args);
    expect(started.isError).toBeFalsy();
    const { jobId } = JSON.parse(started.content[0].text);
    const result = await vi.waitFor(
      async () => {
        const result = await rpc('capture_status', { jobId });
        expect(['complete', 'failed']).toContain(JSON.parse(result.content[0].text).state);
        return result;
      },
      { timeout: 85_000, interval: 100 },
    );
    const status = JSON.parse(result.content[0].text);
    if (test.failure) {
      expect(result.isError).toBe(true);
      expect(status.error).toMatch(/assertion failed|exceeded maxFrames/);
      expect(result.content).toHaveLength(1);
      return;
    }
    expect(status.error).toBeUndefined();
    expect(status.revision).toBe(f.revision());
    expect(status.consoleErrors).toEqual([]);
    expect(status.scenario).toMatchObject({
      source: test.source,
      seed: test.seed,
      frame: test.frame,
      snapshot: { frame: test.frame, x: test.x, seed: test.seed },
    });
    const pixels = PNG.sync.read(Buffer.from(result.content[1].data, 'base64'));
    expect([pixels.width, pixels.height]).toEqual(test.args.viewport === 'mobile' ? [390, 844] : [960, 600]);
    const center = (100 * pixels.width + 100) * 4;
    expect([...pixels.data.subarray(center, center + 4)]).toEqual([test.frame, test.x, test.seed, 255]);
  },
  90_000,
);
