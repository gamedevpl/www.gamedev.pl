import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { runLiveAgent, liveArgs, type Steer } from './live-agent.js';
import { loadAdapters } from './adapters.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it.each(['codex', 'muse'])('drains late acknowledgements for the exact active %s turn', async (name) => {
  const root = mkdtempSync(join(tmpdir(), 'gd-steer-test-'));
  roots.push(root);
  const command = join(root, 'agent');
  writeFileSync(
    command,
    `#!${process.execPath}
 const rl=require('node:readline').createInterface({input:process.stdin});
 const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
 rl.on('line',line=>{ const m=JSON.parse(line); if(m.id===undefined)return;
 let result={};
 if(m.method==='thread/start') result={thread:{id:'session'}};
 if(m.method==='session/start') result={session:{sessionId:'session'}};
 if(m.method==='turn/start' && (m.params.effort??m.params.reasoningEffort)!=='high')process.exit(3);
 if(m.method==='turn/start') result={turn:{id:'turn'},turnId:'turn',status:'accepted'};
 if(m.method==='turn/steer') {
 if(m.params.expectedTurnId!=='turn'||m.params.input[0].text!=='correction')process.exit(2);
 result={turnId:'turn',status:'accepted'};
 }
 if(m.method==='turn/steer') {
 send({method:'turn/completed',params:{threadId:'session',sessionId:'session',turn:{id:'turn',status:'completed'},turnId:'turn',terminal:'completed'}});
 setTimeout(()=>send({id:m.id,result}),100);
 } else send({id:m.id,result});
 });`,
    { mode: 0o700 },
  );
  const spec = {
    ...loadAdapters().adapters.find((s) => s.name === name)!,
    command,
    selection: { model: 'test-model', effort: 'high' },
  };
  let send: Steer | undefined, pending: Promise<void> | undefined;
  const result = await runLiveAgent({
    spec,
    cwd: root,
    env: process.env,
    prompt: 'original',
    onSteering: (fn) => {
      send = fn;
      if (fn) pending = fn('correction');
    },
  });
  await pending;
  expect(result.code).toBe(0);
  expect(send).toBeUndefined();
});
it('keeps unknown adapter configurations on the existing queue path', () => {
  const muse = loadAdapters().adapters.find((s) => s.name === 'muse')!;
  expect(liveArgs({ ...muse, headless: [...muse.headless, '--custom-flag'] })).toBeUndefined();
  expect(liveArgs(loadAdapters().adapters.find((s) => s.name === 'claude')!)).toBeUndefined();
});

it.each(['reject', 'close', 'wrong-turn', 'abort', 'completed-abort', 'approval'])(
  'handles %s without silently starting another task',
  async (behavior) => {
    const root = mkdtempSync(join(tmpdir(), 'gd-steer-failure-'));
    roots.push(root);
    const command = join(root, 'agent');
    writeFileSync(
      command,
      `#!${process.execPath}
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line); if(m.id===undefined)return;
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='session/start')send({id:m.id,result:{session:{sessionId:'session'}}});
 if(m.method==='turn/start')send({id:m.id,result:{turnId:'turn'}});
 if(m.method==='turn/steer') {
  const mode=${JSON.stringify(behavior)};
  if(mode==='close')return process.exit(0);
  if(mode==='abort')return;
  if(mode==='completed-abort')return send({method:'turn/completed',params:{sessionId:'session',turnId:'turn',terminal:'completed'}});
  if(mode==='approval')return send({id:'approval',method:'approval/request',params:{sessionId:'session'}});
  if(mode==='reject')send({id:m.id,error:{message:'Turn no longer active'}});
  if(mode==='wrong-turn')send({id:m.id,result:{turnId:'other'}});
  setTimeout(()=>send({method:'turn/completed',params:{sessionId:'session',turnId:'turn',terminal:'completed'}}),20);
 }
});`,
      { mode: 0o700 },
    );
    const spec = { ...loadAdapters().adapters.find((s) => s.name === 'muse')!, command };
    const abort = new AbortController();
    let pending: Promise<unknown> | undefined;
    const result = await runLiveAgent({
      spec,
      cwd: root,
      env: process.env,
      prompt: 'original',
      abort: abort.signal,
      onSteering(fn) {
        if (!fn) return;
        pending = fn('correction').catch((e) => e);
        if (behavior === 'abort') abort.abort();
        if (behavior === 'completed-abort') setTimeout(() => abort.abort(), 100);
      },
    });
    expect(await pending).toBeInstanceOf(Error);
    expect(result.code).toBe(['reject', 'wrong-turn'].includes(behavior) ? 0 : 1);
    expect(result.permissionSession).toBe(behavior === 'approval' ? 'session' : undefined);
  },
);

it('preserves local MCP configuration and keeps unverified transports queued', () => {
  const codex = loadAdapters().adapters.find((s) => s.name === 'codex')!;
  const config = 'mcp_servers.preview.url="http://127.0.0.1:1/mcp"';
  expect(liveArgs({ ...codex, headless: [...codex.headless, '-c', config] })).toContain(config);
  for (const name of ['copilot', 'agy', 'vibe', 'claude'])
    expect(liveArgs(loadAdapters().adapters.find((s) => s.name === name)!)).toBeUndefined();
});
