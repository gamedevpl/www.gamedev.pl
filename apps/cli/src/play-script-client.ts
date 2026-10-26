import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { LIVE_GAME_TOOLS, type LiveToolName } from './live-game-protocol.js';

const CLIENT = String.raw`
export async function connect() {
  const config=CONFIG;
  let id=0;
  async function call(name,args={}) {
    const response=await fetch(config.url,{
      method:'POST',headers:{'content-type':'application/json',authorization:config.authorization},
      body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}})
    });
    if(!response.ok)throw Error('Play script endpoint unavailable ('+response.status+'); observe before retrying.');
    const reply=await response.json();
    if(reply.error)throw Error(reply.error.message);
    const result=reply.result;
    if(result.isError)throw Error(result.content?.[0]?.text||'Play script failed');
    return JSON.parse(result.content.find(item=>item.type==='text').text);
  }
  const observe=()=>call('game_observe',{screenshot:false});
  const act=actions=>call('game_act',{actions,screenshot:false});
  async function run(policy) {
    const initial=await call('game_take_control',{screenshot:false});
    try{return await policy({initial,observe,act,call});}
    finally{await call('game_release_control');}
  }
  return {call,observe,act,run};
}
`;

export const PLAY_SCRIPT_TOOL = {
  name: 'game_script_client' as const,
  description:
    'Prepare a task-scoped Node ESM client for heuristic scripts controlling the SAME running game. Prefer this for sustained play: inspect state, write a strategy, execute many observe/act decisions in code, then review compact metrics and refine the script. Returns modulePath; dynamically import it in your script and await connect(). The script makes local MCP requests without model turns. No game source or credentials need to be copied. Only live-game/journal tools are exposed. Existing creator consent, frame limits and reclaim apply. Ends on timeout, call budget, task end or cancellation; never retry uncertain actions automatically.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      maxCalls: { type: 'integer', minimum: 1, maximum: 1000, default: 200 },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000, default: 60000 },
    },
  },
};

type Reply = { content: unknown[] };
export async function createPlayScriptClient(input: {
  call: (name: LiveToolName, args: unknown, signal: AbortSignal) => Promise<Reply>;
  signal: AbortSignal;
  maxCalls: number;
  timeoutMs: number;
  release: () => void;
}) {
  input.signal.throwIfAborted();
  const controller = new AbortController();
  const key = `Bearer ${randomBytes(32).toString('hex')}`;
  let calls = 0;
  let closed = false;
  let dir: string | undefined;
  const server = createServer(async (req, res) => {
    if (closed || req.method !== 'POST' || req.url !== '/mcp' || req.headers.authorization !== key) {
      res.writeHead(403).end();
      return;
    }
    let id: unknown = null;
    const disconnected = new AbortController();
    const disconnect = () => disconnected.abort();
    res.once('close', disconnect);
    try {
      let body = '';
      for await (const part of req) {
        body += part;
        if (Buffer.byteLength(body) > 64000) throw Error('Play script request too large');
      }
      const message = JSON.parse(body);
      id = message.id ?? null;
      if (message.jsonrpc !== '2.0' || message.method !== 'tools/call') throw Error('Expected MCP tools/call');
      const name = message.params?.name;
      if (!LIVE_GAME_TOOLS.some((tool) => tool.name === name)) throw Error('Unsupported Play script tool');
      if (name !== 'game_release_control' && ++calls > input.maxCalls) {
        input.release();
        throw Error('Play script call budget exhausted; control released. Review results before another run.');
      }
      const result = await input.call(
        name,
        message.params?.arguments ?? {},
        AbortSignal.any([input.signal, controller.signal, disconnected.signal]),
      );
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    } catch (error) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: error instanceof Error ? error.message : 'Play script request failed' },
        }),
      );
    } finally {
      res.off('close', disconnect);
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxConnections = 4;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    input.signal.removeEventListener('abort', close);
    controller.abort();
    input.release();
    server.closeAllConnections();
    server.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  };
  const timer = setTimeout(close, input.timeoutMs);
  timer.unref();
  input.signal.addEventListener('abort', close, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    input.signal.throwIfAborted();
    if (closed) throw Error('Play script setup expired');
    dir = mkdtempSync(join(tmpdir(), 'gamedev-play-script-'));
    const modulePath = join(dir, 'client.mjs');
    const config = { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, authorization: key };
    writeFileSync(modulePath, CLIENT.replace('CONFIG', JSON.stringify(config)), { mode: 0o600 });
    return { modulePath, close };
  } catch (error) {
    close();
    throw error;
  }
}
