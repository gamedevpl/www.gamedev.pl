import { codexInteractiveArgs } from './codex-interactive.js';
import { terminalRecording } from './terminal-recording.js';
import { spawn } from 'node:child_process';
import type { AdapterSpec } from './adapters.js';

export type InteractiveRun = (input: {
  spec: AdapterSpec;
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  conversation?: string;
  logPath?: string;
  abort: AbortSignal;
}) => Promise<{ code: number | null }>;

export function agyConversation(line: string): string | undefined {
  try {
    const event = JSON.parse(line) as { event?: string; conversation_id?: unknown };
    return event.event === 'init' &&
      typeof event.conversation_id === 'string' &&
      /^[a-f0-9-]{36}$/i.test(event.conversation_id)
      ? event.conversation_id
      : undefined;
  } catch {
    return undefined;
  }
}

export function interactiveArgs(input: Parameters<InteractiveRun>[0]): string[] {
  if (input.spec.name === 'codex') return codexInteractiveArgs(input.spec.headless, input.prompt);
  const args: string[] = [];
  for (let i = 0; i < input.spec.headless.length; i++) {
    const arg = input.spec.headless[i];
    if (arg === '--output-format') {
      i++;
      continue;
    }
    if (['--print', '-p', '--prompt'].includes(arg)) continue;
    args.push(arg);
  }
  if (input.conversation) args.push('--conversation', input.conversation);
  return [
    ...args,
    '--prompt-interactive',
    input.prompt +
      '\nThis is now an interactive session. Ask the creator for any required permissions. Finish the task, then let the creator exit so gamedevpl can verify it. Do not publish.',
  ];
}

export const runInteractive: InteractiveRun = async (input) => {
  if (input.abort.aborted) return { code: null };
  const recording = terminalRecording(input.spec.command, interactiveArgs(input), input.logPath);
  const child = spawn(recording.command, recording.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  const stop = () => {
    child.kill('SIGTERM');
  };
  // Share the terminal; let Antigravity handle Ctrl+C.
  const interrupt = () => {};
  process.on('SIGINT', interrupt);
  input.abort.addEventListener('abort', stop, { once: true });
  try {
    return await new Promise<{ code: number | null }>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve({ code }));
    });
  } finally {
    process.off('SIGINT', interrupt);
    input.abort.removeEventListener('abort', stop);
    recording.finish();
  }
};
