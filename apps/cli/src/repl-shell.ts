import { spawnCommand } from './delegate.js';
import { stripTerminalControls } from './ansi.js';
import type { Workshop } from './workshop.js';

const OUTPUT_LIMIT = 256_000;
const LINE_LIMIT = 8000;

export function shellInvocation(command: string, env: NodeJS.ProcessEnv, platform = process.platform) {
  return {
    command,
    args: [],
    shell: platform === 'win32' ? env.ComSpec || env.COMSPEC || 'cmd.exe' : env.SHELL || '/bin/bash',
  };
}

export async function runReplShell(input: {
  line: string;
  allowShell?: boolean;
  cwd?: string;
  workshop?: Pick<Workshop, 'root'>;
  env?: NodeJS.ProcessEnv;
  abort?: Workshop['abort'];
  write: (line: string) => void;
  onActivity?: (activity: string) => void;
}): Promise<void> {
  if (!input.allowShell) {
    input.write('Use !<command> in the terminal session, for example !pwd.');
    return;
  }
  const command = input.line.trimStart().slice(1).trim();
  if (!command) {
    input.write('Use !<command>, for example !pwd or !npm test.');
    return;
  }
  const controller = new AbortController();
  if (input.abort) input.abort.current = controller;
  const env = input.env ?? process.env;
  const buffers = { stdout: '', stderr: '' };
  let remaining = OUTPUT_LIMIT;
  let truncated = false;
  const emit = (text: string): void => input.write(stripTerminalControls(text));
  const receive = (stream: keyof typeof buffers, chunk: string): void => {
    const accepted = chunk.slice(0, remaining);
    remaining -= accepted.length;
    const lines = (buffers[stream] + accepted).split('\n');
    buffers[stream] = lines.pop()!;
    for (const line of lines) emit(line);
    while (buffers[stream].length >= LINE_LIMIT) {
      emit(buffers[stream].slice(0, LINE_LIMIT));
      buffers[stream] = buffers[stream].slice(LINE_LIMIT);
    }
    if (accepted.length < chunk.length && !truncated) {
      truncated = true;
      emit('Shell output truncated; redirect to a file to keep the full output.');
    }
  };
  try {
    input.onActivity?.('Running shell command — Ctrl+C to stop');
    const child = spawnCommand({
      ...shellInvocation(command, env),
      cwd: input.workshop?.root ?? input.cwd ?? process.cwd(),
      env,
      abort: controller.signal,
    });
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => receive('stdout', chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => receive('stderr', chunk));
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    for (const tail of Object.values(buffers)) if (tail) emit(tail);
    emit(
      controller.signal.aborted
        ? 'Shell command stopped.'
        : result.signal
          ? `Shell command ended (${result.signal}).`
          : `Shell command exited with code ${result.code}.`,
    );
  } catch (error) {
    emit(`Could not run shell command: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (input.abort?.current === controller) input.abort.current = null;
  }
}
