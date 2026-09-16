import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type RpcValue = Record<string, unknown>;
export function agentRpc(input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  abort?: AbortSignal;
  event: (method: string, params: RpcValue, id?: number | string) => void;
  stderr: (line: string) => void;
}) {
  const child: ChildProcessWithoutNullStreams = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: 'pipe',
    detached: process.platform !== 'win32',
  });
  let buffer = Buffer.alloc(0);
  let sequence = 0;
  let failure: Error | undefined;
  let stopping = false;
  const pending = new Map<
    number,
    { resolve: (value: RpcValue) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  let exitResolve: () => void;
  const exited = new Promise<void>((resolve) => {
    exitResolve = resolve;
  });
  function fail(error: Error) {
    failure ??= error;
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      child.kill(signal);
    }
  };
  const abort = () => {
    fail(new Error('Agent stopped.'));
    kill('SIGTERM');
  };
  child.once('error', fail);
  child.once('close', () => {
    fail(new Error('Agent session closed; delivery outcome may be unknown. Check the transcript before resending.'));
    exitResolve();
    if (!stopping) input.event('transport/closed', { message: failure?.message });
  });
  child.stdin.on('error', fail);
  child.stderr.on('data', (raw: Buffer) => input.stderr(raw.toString().slice(0, 8000)));
  function send(value: RpcValue) {
    if (failure) throw failure;
    const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...value }));
    child.stdin.write(Buffer.concat([data, Buffer.from('\n')]));
  }
  child.stdout.on('data', (raw: Buffer) => {
    buffer = Buffer.concat([buffer, raw]);
    if (buffer.length > 16 * 1024 * 1024) {
      fail(new Error('Agent response exceeds 16 MiB.'));
      abort();
      return;
    }
    try {
      for (;;) {
        const end = buffer.indexOf('\n');
        if (end < 0) break;
        const body = buffer.subarray(0, end);
        buffer = buffer.subarray(end + 1);
        if (!body.length) continue;
        const message = JSON.parse(body.toString());
        if (typeof message.method === 'string') input.event(message.method, message.params ?? {}, message.id);
        else {
          const waiter = pending.get(message.id);
          if (!waiter) continue;
          pending.delete(message.id);
          clearTimeout(waiter.timer);
          if (message.error) waiter.reject(new Error(String(message.error.message ?? 'Agent rejected the request.')));
          else waiter.resolve(message.result ?? {});
        }
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Invalid agent response.'));
      kill('SIGTERM');
    }
  });
  input.abort?.addEventListener('abort', abort, { once: true });
  if (input.abort?.aborted) abort();
  return {
    notify(method: string, params: RpcValue = {}) {
      send({ method, params });
    },
    reject(id: number | string) {
      send({ id, error: { code: -32601, message: 'This client cannot grant this request.' } });
    },
    request(method: string, params: RpcValue = {}): Promise<RpcValue> {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Delivery outcome unknown: agent acknowledgement timed out. Do not resend blindly.'));
        }, 30_000);
        pending.set(id, { resolve, reject, timer });
        try {
          send({ id, method, params });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    },
    async close() {
      stopping = true;
      input.abort?.removeEventListener('abort', abort);
      abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        exited,
        new Promise<void>((r) => {
          timer = setTimeout(r, 2000);
        }),
      ]);
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) kill('SIGKILL');
    },
  };
}
