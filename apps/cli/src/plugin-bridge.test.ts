import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function bridge(handler: Parameters<typeof createServer>[0], key = 'test-creator-key') {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address() as { port: number };
  const root = mkdtempSync(join(tmpdir(), 'plugin-bridge-'));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const preload = join(root, 'fetch.mjs');
  writeFileSync(
    preload,
    `const real = fetch; globalThis.fetch = (url, init) => {
    if (url !== 'https://www.gamedev.pl/api/mcp') throw new Error('unexpected destination');
    return real('http://127.0.0.1:${address.port}', init);
  };`,
  );
  const child = spawn(
    process.execPath,
    ['--import', preload, fileURLToPath(new URL('./plugin-bridge.mjs', import.meta.url))],
    {
      env: { ...process.env, GAMEDEV_CREATOR_KEY: key },
      stdio: 'pipe',
    },
  );
  cleanup.push(() => {
    child.kill();
  });
  return client(child, server);
}

function client(child: ChildProcessWithoutNullStreams, server: Server) {
  const queued: Record<string, unknown>[] = [];
  const waiters: Array<(value: Record<string, unknown>) => void> = [];
  let buffer = '',
    output = '',
    errors = '';
  child.stdout.on('data', (data: Buffer) => {
    output += data.toString();
    buffer += data.toString();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const value = JSON.parse(buffer.slice(0, end)) as Record<string, unknown>;
      buffer = buffer.slice(end + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(value);
      else queued.push(value);
    }
  });
  child.stderr.on('data', (data: Buffer) => {
    errors += data.toString();
  });
  return {
    server,
    send(value: unknown) {
      child.stdin.write(typeof value === 'string' ? `${value}\n` : `${JSON.stringify(value)}\n`);
    },
    next() {
      return queued.length
        ? Promise.resolve(queued.shift()!)
        : new Promise<Record<string, unknown>>((resolve) => waiters.push(resolve));
    },
    text: () => output + errors,
    end: () =>
      new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.stdin.end();
      }),
  };
}

it('forwards the MCP handshake, session headers and SSE tool results without exposing credentials', async () => {
  const requests: Array<{ method: string; headers: Record<string, unknown> }> = [];
  const c = await bridge(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const message = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ method: message.method, headers: request.headers });
    if (message.method === 'notifications/initialized') {
      response.writeHead(202).end();
      return;
    }
    response.setHeader('mcp-session-id', 'session-1');
    if (message.method === 'initialize') {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } },
        }),
      );
    } else {
      response.setHeader('content-type', 'text/event-stream');
      response.write(': heartbeat\r\n\r\n');
      response.end(
        `event: message\r\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'list_account_games' }] } })}\r\n\r\n`,
      );
    }
  });
  c.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  expect(await c.next()).toMatchObject({ id: 1, result: { protocolVersion: '2025-11-25' } });
  c.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  c.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  expect(await c.next()).toMatchObject({ id: 2, result: { tools: [{ name: 'list_account_games' }] } });
  expect(requests.map((r) => r.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
  expect(requests[2]?.headers).toMatchObject({
    authorization: 'Bearer test-creator-key',
    'mcp-session-id': 'session-1',
    'mcp-protocol-version': '2025-11-25',
  });
  expect(c.text()).not.toContain('test-creator-key');
});

it('returns a JSON-RPC auth error without starting a network request when no key is configured', async () => {
  let calls = 0;
  const c = await bridge((_request, response) => {
    calls++;
    response.writeHead(500).end();
  }, '');
  c.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  expect(await c.next()).toMatchObject({
    id: 1,
    error: { code: -32000, message: expect.stringContaining('GAMEDEV_CREATOR_KEY') },
  });
  expect(calls).toBe(0);
  c.send('{invalid');
  expect(await c.next()).toMatchObject({ id: null, error: { code: -32700 } });
});

it('reports HTTP failures without echoing response bodies or authorization', async () => {
  const c = await bridge((_request, response) => {
    response.writeHead(401).end('sensitive response body');
  });
  c.send({ jsonrpc: '2.0', id: 5, method: 'initialize' });
  expect(await c.next()).toMatchObject({ id: 5, error: { message: 'Gamedev.pl MCP returned HTTP 401' } });
  expect(c.text()).not.toContain('sensitive response body');
  expect(c.text()).not.toContain('test-creator-key');
});

it('does not forward requests queued behind initialization after the client disconnects', async () => {
  let received!: () => void;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  let calls = 0;
  const c = await bridge(() => {
    calls++;
    received();
  });
  c.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  c.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await started;
  await c.end();
  expect(calls).toBe(1);
});
