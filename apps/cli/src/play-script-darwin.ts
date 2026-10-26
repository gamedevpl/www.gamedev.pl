import { spawn, type ChildProcess } from 'node:child_process';

// macOS cannot traverse directories through /dev/fd; inherit cwd instead.
const HELPER = String.raw`
import {execFileSync} from 'node:child_process';
import {constants,statSync,openSync,closeSync,readSync,writeSync,writeFileSync,unlinkSync} from 'node:fs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let req,resp,closed=false,received=false,timer;
function close(){
  if(closed)return;closed=true;clearInterval(timer);
  for(const fd of [req,resp])if(fd!==undefined)try{closeSync(fd)}catch{}
  for(const name of ['requests.fifo','responses.fifo','client.mjs','client.lock'])try{unlinkSync(name)}catch{}
  if(process.connected)process.disconnect();
}
process.on('disconnect',close);
process.on('message',async message=>{
  try{
    if(message.type==='init'){
      const dir=statSync('.');
      if(String(dir.dev)!==message.dev||String(dir.ino)!==message.ino)throw Error('Play script directory changed');
      execFileSync('/usr/bin/mkfifo',['-m','600','requests.fifo','responses.fifo'],{timeout:5000});
      const flags=constants.O_NONBLOCK|constants.O_NOFOLLOW;
      req=openSync('requests.fifo',constants.O_RDONLY|flags);resp=openSync('responses.fifo',constants.O_RDWR|flags);
      writeFileSync('client.mjs',message.source,{mode:0o600,flag:'wx'});
      timer=setInterval(()=>{
        try{const b=Buffer.allocUnsafe(65536);for(;;){let n;
          try{n=readSync(req,b,0,b.length,null)}catch(e){if(e.code==='EAGAIN'||e.code==='EWOULDBLOCK')break;throw e}
          if(!n){if(received)close();break}received=true;
          process.send({type:'data',data:b.subarray(0,n).toString('base64')});
        }}catch{close()}
      },15);
      process.send({type:'ready'});
    }else if(message.type==='reply'){
      const data=Buffer.from(message.data,'base64');let offset=0;
      while(offset<data.length&&!closed){
        try{offset+=writeSync(resp,data,offset,data.length-offset)}catch(e){if(e.code!=='EAGAIN'&&e.code!=='EWOULDBLOCK')throw e;await wait(10)}
      }
      if(!closed)process.send({type:'written',id:message.id});
    }else if(message.type==='close')close();
  }catch(error){if(process.connected)process.send({type:'error',message:error.message});close()}
});
`;

type Input = {
  cwd: string;
  dev: number;
  ino: number;
  source: string;
  data: (bytes: Buffer) => void;
  failed: () => void;
};

export function onDarwinExit(child: Pick<ChildProcess, 'exitCode' | 'signalCode' | 'once'>, onExit: () => void) {
  if (child.exitCode !== null || child.signalCode !== null) onExit();
  else child.once('exit', onExit);
}

export async function startDarwinPipe(input: Input) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', HELPER], {
    cwd: input.cwd,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let next = 0;
  const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  let ready = false;
  let closing = false;
  const startup = new Promise<void>((resolve, reject) => {
    child.on('message', (message: { type: string; data?: string; id?: number; message?: string }) => {
      if (message.type === 'ready') {
        ready = true;
        resolve();
      } else if (message.type === 'data') input.data(Buffer.from(message.data!, 'base64'));
      else if (message.type === 'written') {
        pending.get(message.id!)?.resolve();
        pending.delete(message.id!);
      } else if (message.type === 'error') reject(Error(message.message ?? 'Play script pipe failed'));
    });
    const fail = (error: Error) => {
      reject(error);
      for (const item of pending.values()) item.reject(error);
      pending.clear();
      if (ready && !closing) input.failed();
    };
    child.once('error', fail);
    child.once('exit', () => fail(Error('Play script pipe closed')));
    child.send({ type: 'init', dev: String(input.dev), ino: String(input.ino), source: input.source });
  });
  try {
    await startup;
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    reply(data: Buffer) {
      const id = ++next;
      return new Promise<void>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.send({ type: 'reply', id, data: data.toString('base64') }, (error) => {
          if (error) {
            pending.delete(id);
            reject(error);
          }
        });
      });
    },
    close(onExit: () => void) {
      closing = true;
      onDarwinExit(child, onExit);
      if (child.connected) child.send({ type: 'close' });
    },
  };
}
