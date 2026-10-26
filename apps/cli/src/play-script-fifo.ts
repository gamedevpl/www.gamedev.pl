import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { LIVE_GAME_TOOLS, type LiveToolName } from './live-game-protocol.js';
import { startDarwinPipe } from './play-script-darwin.js';

const CLIENT = String.raw`
import {constants, openSync, closeSync, readSync, writeSync, unlinkSync, existsSync} from 'node:fs';
import {StringDecoder} from 'node:string_decoder';
const config=CONFIG;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function connect(){
  let lock;
  try{lock=openSync(config.lock,'wx',0o600)}catch(error){
    if(error.code==='EEXIST')throw Error('Play script client is already in use. Prepare a new client if the previous process ended.');
    throw error;
  }
  let req,resp,closed=false,id=0,buffer='',timer;
  const pending=new Map();
  const decoder=new StringDecoder('utf8');
  function close(){
    if(closed)return;closed=true;clearTimeout(timer);process.removeListener('exit',close);
    for(const item of pending.values())item.reject(Error('Play script client closed; observe before retrying.'));
    pending.clear();
    for(const fd of [req,resp,lock])if(fd!==undefined)try{closeSync(fd)}catch{}
    try{unlinkSync(config.lock)}catch{}
  }
  try{
    req=openSync(config.request,constants.O_WRONLY|constants.O_NONBLOCK);
    resp=openSync(config.response,constants.O_RDONLY|constants.O_NONBLOCK);
  }catch(error){close();throw error}
  process.once('exit',close);
  function pump(){
    timer=undefined;
    if(closed)return;
    try{
      if(!existsSync(config.request)||Date.now()>=config.expiresAt)throw Error('Play script client expired; observe before retrying.');
      const chunk=Buffer.alloc(65536);
      for(;;){let count;try{count=readSync(resp,chunk,0,chunk.length,null)}catch(error){if(error.code==='EAGAIN'||error.code==='EWOULDBLOCK')break;throw error}
        if(!count)break;buffer+=decoder.write(chunk.subarray(0,count));
        if(buffer.length>4000000)throw Error('Play script response too large');
        for(;;){const end=buffer.indexOf('\n');if(end<0)break;
          const line=buffer.slice(0,end);buffer=buffer.slice(end+1);const reply=JSON.parse(line);
          const item=pending.get(reply.id);if(!item)continue;pending.delete(reply.id);
          if(reply.error)item.reject(Error(reply.error.message));
          else if(reply.result?.isError)item.reject(Error(reply.result.content?.[0]?.text||'Play script failed'));
          else{try{item.resolve(JSON.parse(reply.result.content.find(c=>c.type==='text').text))}catch(error){item.reject(error)}}
        }
      }
    }catch(error){for(const item of pending.values())item.reject(error);pending.clear();close();return}
    if(pending.size)timer=setTimeout(pump,15);
  }
  let writing=Promise.resolve();
  async function write(buffer){let offset=0;
    while(offset<buffer.length){
      if(closed||!existsSync(config.request)||Date.now()>=config.expiresAt)throw Error('Play script client expired; observe before retrying.');
      try{offset+=writeSync(req,buffer,offset,buffer.length-offset)}catch(error){if(error.code!=='EAGAIN'&&error.code!=='EWOULDBLOCK')throw error;await delay(10)}
    }
  }
  async function call(name,args={}){
    if(closed)throw Error('Play script client closed; observe before retrying.');
    const requestId=++id;
    const bytes=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:requestId,authorization:config.authorization,method:'tools/call',params:{name,arguments:args}})+'\n');
    if(bytes.length>64000)throw Error('Play script request too large');
    const result=new Promise((resolve,reject)=>pending.set(requestId,{resolve,reject}));
    const send=writing.then(()=>write(bytes));writing=send.catch(()=>{});
    try{await send}catch(error){pending.delete(requestId);close();throw error}
    if(!timer)timer=setTimeout(pump,0);
    return result;
  }
  const observe=()=>call('game_observe',{screenshot:false});
  const act=actions=>call('game_act',{actions,screenshot:false});
  async function run(policy){
    const initial=await call('game_take_control',{screenshot:false});
    try{return await policy({initial,observe,act,call})}finally{await call('game_release_control')}
  }
  return {call,observe,act,run,close};
}
`;

type Input = {
  call: (name: LiveToolName, args: unknown, signal: AbortSignal) => Promise<{ content: unknown[] }>;
  signal: AbortSignal;
  maxCalls: number;
  timeoutMs: number;
  release: () => void;
  cwd?: string;
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const wouldBlock = (error: unknown) => ['EAGAIN', 'EWOULDBLOCK'].includes((error as NodeJS.ErrnoException)?.code ?? '');

export async function createPlayFifoClient(input: Input) {
  input.signal.throwIfAborted();
  const dir = mkdtempSync(join(input.cwd ?? process.cwd(), '.gamedev-play-script-'));
  const request = join(dir, 'requests.fifo');
  const response = join(dir, 'responses.fifo');
  const lock = join(dir, 'client.lock');
  const modulePath = join(dir, 'client.mjs');
  const authorization = `Bearer ${randomBytes(32).toString('hex')}`;
  const controller = new AbortController();
  let requestFd: number | undefined, responseFd: number | undefined, dirFd: number | undefined;
  let anchoredDir: string | undefined;
  let darwinPipe: Awaited<ReturnType<typeof startDarwinPipe>> | undefined;
  let closed = false,
    active = false,
    calls = 0,
    inputBuffer = '';
  const decoder = new StringDecoder('utf8');
  const messages: string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (deadline) clearTimeout(deadline);
    input.signal.removeEventListener('abort', close);
    controller.abort();
    try {
      input.release();
    } catch {
      // A closed socket still needs the remaining cleanup.
    }
    for (const fd of [requestFd, responseFd])
      if (fd !== undefined)
        try {
          closeSync(fd);
        } catch {
          // The descriptor may already be closed.
        }
    const cleanup = () => {
      if (anchoredDir && dirFd !== undefined) {
        for (const name of ['requests.fifo', 'responses.fifo', 'client.mjs', 'client.lock']) {
          try {
            unlinkSync(join(anchoredDir, name));
          } catch {
            // The file may have been removed already.
          }
        }
        try {
          const expected = fstatSync(dirFd);
          const actual = lstatSync(dir);
          if (expected.dev === actual.dev && expected.ino === actual.ino) rmdirSync(dir);
        } catch {
          // A renamed or nonempty directory is left for its owner to remove.
        }
        closeSync(dirFd);
      } else if (dirFd !== undefined) {
        try {
          const expected = fstatSync(dirFd);
          const actual = lstatSync(dir);
          if (expected.dev === actual.dev && expected.ino === actual.ino) rmdirSync(dir);
        } catch {
          // A renamed or nonempty directory is left for its owner to remove.
        }
        closeSync(dirFd);
      } else {
        try {
          rmdirSync(dir);
        } catch {
          // The directory may no longer be empty or may have been renamed.
        }
      }
    };
    if (darwinPipe) darwinPipe.close(cleanup);
    else cleanup();
  };
  async function reply(value: unknown) {
    let serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized) > 3900000) {
      const id = (value as { id?: unknown }).id ?? null;
      serialized = JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'Play script response too large; request a narrower result.' },
      });
    }
    const data = Buffer.from(serialized + '\n');
    if (darwinPipe) return darwinPipe.reply(data);
    let offset = 0;
    while (offset < data.length && !closed) {
      try {
        offset += writeSync(responseFd!, data, offset, data.length - offset);
      } catch (error) {
        if (!wouldBlock(error)) throw error;
        await wait(10);
      }
    }
  }
  async function processMessage(line: string) {
    let id: unknown = null;
    try {
      if (Buffer.byteLength(line) > 64000) throw Error('Play script request too large');
      const message = JSON.parse(line);
      id = message.id ?? null;
      if (message.authorization !== authorization || message.jsonrpc !== '2.0' || message.method !== 'tools/call')
        throw Error('Invalid Play script request');
      const name = message.params?.name;
      if (!LIVE_GAME_TOOLS.some((tool) => tool.name === name)) throw Error('Unsupported Play script tool');
      if (name !== 'game_release_control' && ++calls > input.maxCalls) {
        input.release();
        throw Error('Play script call budget exhausted; control released. Review results before another run.');
      }
      const result = await input.call(
        name,
        message.params?.arguments ?? {},
        AbortSignal.any([input.signal, controller.signal]),
      );
      await reply({ jsonrpc: '2.0', id, result });
    } catch (error) {
      if (!closed)
        await reply({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: error instanceof Error ? error.message : 'Play script request failed' },
        });
    }
  }
  function ingest(chunk: Buffer) {
    inputBuffer += decoder.write(chunk);
    if (Buffer.byteLength(inputBuffer) > 512000) throw Error('Play script request queue too large');
    for (;;) {
      const end = inputBuffer.indexOf('\n');
      if (end < 0) break;
      messages.push(inputBuffer.slice(0, end));
      inputBuffer = inputBuffer.slice(end + 1);
      if (messages.length > 32) throw Error('Play script request queue too large');
    }
  }
  function pump() {
    if (closed) return;
    try {
      const chunk = Buffer.allocUnsafe(65536);
      while (!darwinPipe) {
        let count: number;
        try {
          count = readSync(requestFd!, chunk, 0, chunk.length, null);
        } catch (error) {
          if (wouldBlock(error)) break;
          throw error;
        }
        if (!count) break;
        ingest(chunk.subarray(0, count));
      }
      if (!active && messages.length) {
        active = true;
        void processMessage(messages.shift()!)
          .catch(close)
          .finally(() => {
            active = false;
          });
      }
    } catch {
      close();
    }
  }
  try {
    dirFd = openSync(dir, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
    if (!fstatSync(dirFd).isDirectory()) throw Error('Invalid Play script directory');
    const source = CLIENT.replace(
      'CONFIG',
      JSON.stringify({ request, response, lock, authorization, expiresAt: Date.now() + input.timeoutMs }),
    );
    if (process.platform === 'darwin') {
      const stat = fstatSync(dirFd);
      darwinPipe = await startDarwinPipe({
        cwd: dir,
        dev: stat.dev,
        ino: stat.ino,
        source,
        data: (bytes) => {
          try {
            ingest(bytes);
          } catch {
            close();
          }
        },
        failed: close,
      });
    } else {
      anchoredDir = `/proc/self/fd/${dirFd}`;
      const mkfifo = existsSync('/usr/bin/mkfifo') ? '/usr/bin/mkfifo' : '/bin/mkfifo';
      execFileSync(mkfifo, ['-m', '600', 'requests.fifo', 'responses.fifo'], { cwd: anchoredDir, timeout: 5000 });
      const flags = constants.O_RDWR | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0);
      requestFd = openSync(join(anchoredDir, 'requests.fifo'), flags);
      responseFd = openSync(join(anchoredDir, 'responses.fifo'), flags);
      if (!fstatSync(requestFd).isFIFO() || !fstatSync(responseFd).isFIFO()) throw Error('Invalid Play script channel');
      writeFileSync(join(anchoredDir, 'client.mjs'), source, { mode: 0o600, flag: 'wx' });
    }
    timer = setInterval(pump, 15);
    timer.unref();
    deadline = setTimeout(close, input.timeoutMs);
    deadline.unref();
    input.signal.addEventListener('abort', close, { once: true });
    input.signal.throwIfAborted();
    return { modulePath, close };
  } catch (error) {
    close();
    throw error;
  }
}
