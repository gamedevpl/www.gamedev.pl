import { createInterface } from 'node:readline';

const endpoint = 'https://www.gamedev.pl/api/mcp';
let session;
let protocol = '2025-03-26';
const output = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const controllers = new Map();
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let initialized = Promise.resolve();
let closed = false;

async function readReply(response, id) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('MCP stream ended without a reply');
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 4_000_000) throw new Error('MCP reply exceeds limit');
      buffer = buffer.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        const message = JSON.parse(data);
        if (message.id === id) return message;
        output(message);
      }
    }
  } finally {
    await reader.cancel();
  }
}

async function forward(message) {
  if (closed) return;
  if (message.method === 'notifications/cancelled') {
    controllers.get(message.params?.requestId)?.abort();
    return;
  }
  const hasId = Object.hasOwn(message, 'id');
  const controller = new AbortController();
  if (hasId) controllers.set(message.id, controller);
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const key = process.env.GAMEDEV_CREATOR_KEY?.trim();
    if (!key || /\s/.test(key) || key.startsWith('${'))
      throw new Error('Set GAMEDEV_CREATOR_KEY in your coding agent environment; use the key value only');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': protocol,
        ...(session ? { 'mcp-session-id': session } : {}),
      },
      body: JSON.stringify(message),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Gamedev.pl MCP returned HTTP ${response.status}`);
    session = response.headers.get('mcp-session-id') ?? session;
    if (response.status === 202 || response.status === 204) return;
    const reply = await readReply(response, message.id);
    if (message.method === 'initialize' && reply.result?.protocolVersion) protocol = reply.result.protocolVersion;
    if (hasId) output(reply);
  } catch (error) {
    if (hasId) output({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: error.message } });
    else process.stderr.write('Gamedev.pl MCP notification failed\n');
  } finally {
    clearTimeout(timeout);
    controllers.delete(message.id);
  }
}

input.on('line', (line) => {
  let message;
  try {
    if (line.length > 4_000_000) throw new Error('message too large');
    message = JSON.parse(line);
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') throw new Error('invalid request');
  } catch {
    output({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON-RPC request' } });
    return;
  }
  if (message.method === 'initialize') initialized = forward(message);
  else if (message.method === 'notifications/initialized') initialized = initialized.then(() => forward(message));
  else void initialized.then(() => forward(message));
});
input.on('close', () => {
  closed = true;
  for (const controller of controllers.values()) controller.abort();
});
