import { spawn, type ChildProcess } from 'node:child_process';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

type Io = { stdin?: { isTTY?: boolean }; stdout: NodeJS.WriteStream };

export function historyOutput(input: { io: Io; env?: NodeJS.ProcessEnv; disabled?: boolean }) {
  const env = input.env ?? process.env;
  const configured = env.PAGER;
  let plain =
    input.disabled ||
    !input.io.stdout.isTTY ||
    !(input.io.stdin?.isTTY ?? process.stdin.isTTY) ||
    env.TERM === 'dumb' ||
    configured?.trim() === '' ||
    configured?.trim() === 'cat';
  const abort = new AbortController();
  let child: ChildProcess | undefined;
  let stopped = false;
  let complete: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
  const start = async () => {
    child = configured
      ? spawn(configured, { shell: true, env: { ...process.env, ...env }, stdio: ['pipe', 'inherit', 'inherit'] })
      : spawn(process.platform === 'win32' ? 'more' : 'less', process.platform === 'win32' ? [] : ['-FRX'], {
          env: { ...process.env, ...env },
          stdio: ['pipe', 'inherit', 'inherit'],
        });
    child.stdin!.on('error', () => {});
    complete = new Promise((resolve) => {
      child!.once('close', (code, signal) => {
        if (!plain) {
          stopped = true;
          abort.abort();
        }
        resolve({ code, signal });
      });
    });
    await new Promise<void>((resolve) => {
      child!.once('spawn', resolve);
      child!.once('error', () => {
        plain = true;
        resolve();
      });
    });
  };
  return {
    signal: abort.signal,
    stopped: () => stopped,
    async write(text: string): Promise<boolean> {
      if (stopped) return false;
      if (!plain && !child) await start();
      if (plain) {
        input.io.stdout.write(text + '\n');
        return true;
      }
      if (stopped) return false;
      return new Promise<boolean>((resolve, reject) => {
        child!.stdin!.write(text + '\n', (error) => {
          if (!error) resolve(!stopped);
          else if (
            (error as NodeJS.ErrnoException).code === 'EPIPE' ||
            (error as NodeJS.ErrnoException).code === 'ERR_STREAM_DESTROYED'
          )
            resolve(false);
          else reject(error);
        });
      });
    },
    async finish(terminate = false): Promise<void> {
      if (!child) return;
      if (terminate && !stopped) child.kill();
      child.stdin?.end();
      const result = await complete!;
      if (!terminate && !plain && result.code !== 0)
        throw new CliError(
          `pager exited unsuccessfully (${result.signal ?? result.code}); use --no-pager or check PAGER`,
          EXIT_REFUSED,
        );
    },
  };
}
