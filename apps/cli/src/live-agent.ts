import { randomBytes } from 'node:crypto';
import type { AdapterSpec } from './adapters.js';
import { agentRpc, type RpcValue } from './agent-rpc.js';

export type Steer = (text: string) => Promise<void>;
export type LiveRunInput = {
  spec: AdapterSpec;
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  abort?: AbortSignal;
  onLine?: (line: string) => void;
  onSteering?: (send: Steer | undefined) => void;
};
function uuid7() {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function liveArgs(spec: AdapterSpec): string[] | undefined {
  if (!['codex', 'muse'].includes(spec.name)) return undefined;
  const args: string[] = [];
  for (let i = 0; i < spec.headless.length; i++) {
    const arg = spec.headless[i]!;
    if (['exec', '--json', '--skip-git-repo-check', '--prompt'].includes(arg)) continue;
    if (['--sandbox', '--output-format'].includes(arg)) {
      if (arg === '--sandbox' && spec.headless[i + 1] !== 'workspace-write') return undefined;
      i++;
      continue;
    }
    if (arg === '--model' || arg === '-m' || arg === '--reasoning-effort' || arg === '--effort') {
      if (!(arg === '--model' || arg === '-m' ? spec.selection?.model : spec.selection?.effort)) return undefined;
      i++;
      continue;
    }
    if (arg === '-c' && spec.name === 'codex') {
      args.push(arg, spec.headless[++i]!);
      continue;
    }
    if (spec.name === 'muse' && arg !== '--trust-workspace') return undefined;
    if (spec.name === 'codex') return undefined;
    args.push(arg);
  }
  return spec.name === 'codex' ? [...args, 'app-server'] : ['serve', ...args];
}
export async function runLiveAgent(input: LiveRunInput): Promise<{ code: number; permissionSession?: string }> {
  const args = liveArgs(input.spec);
  if (!args) throw new Error('This adapter supports queued follow-ups only.');
  const name = input.spec.name;
  let session = '',
    turn = '',
    active = false,
    finished = false;
  let permissionSession: string | undefined;
  let complete: (code: number) => void;
  const done = new Promise<number>((resolve) => {
    complete = resolve;
  });
  const finish = (code: number) => {
    if (finished) return;
    finished = true;
    active = false;
    input.onSteering?.(undefined);
    complete(code);
  };
  const line = (text: unknown) => {
    if (typeof text === 'string' && text) input.onLine?.(text);
  };
  const rpc = agentRpc({
    ...input,
    command: input.spec.command,
    args,
    stderr: line,
    event(method, params, id) {
      if (method === 'transport/closed') {
        line(params.message);
        finish(1);
        return;
      }
      if (id !== undefined) {
        if (name === 'muse' && method === 'approval/request') {
          permissionSession = session;
          line('Muse needs your approval — returning to permission handoff.');
          finish(1);
        }
        rpc.reject(id);
        return;
      }
      if (method === 'turn/completed') {
        const value = params.turn as RpcValue | undefined;
        if (name === 'codex' && params.threadId !== session) return;
        if (name === 'muse' && params.sessionId !== session) return;
        const completedTurn = name === 'muse' ? params.turnId : value?.id;
        if (turn && completedTurn !== turn) return;
        const status = name === 'muse' ? params.terminal : value?.status;
        const error = (params.error ?? value?.error) as RpcValue | undefined;
        line(error?.message);
        finish(status === 'completed' ? 0 : 1);
      }
      if (method === 'item/completed' || method === 'item/started') {
        if ((name === 'codex' ? params.threadId : params.sessionId) !== session) return;
        const item = params.item as RpcValue | undefined;
        const kind = item?.type ?? item?.kind;
        if (kind === 'agentMessage' && method === 'item/completed') line(item?.text);
        else if (
          method === 'item/started' &&
          ['commandExecution', 'toolCall', 'mcpToolCall', 'fileChange'].includes(String(kind))
        )
          line(`⚙ ${item?.toolName ?? kind}`);
      }
    },
  });
  const stop = () => finish(1);
  input.abort?.addEventListener('abort', stop, { once: true });
  const deadline = setTimeout(stop, 30 * 60_000);
  try {
    if (input.abort?.aborted) throw new Error('Agent stopped.');
    await rpc.request('initialize', {
      clientInfo: { name: 'gamedevpl', version: '1' },
      ...(name === 'muse' ? { capabilities: { userInputDialogs: false } } : {}),
    });
    rpc.notify('initialized');
    const created = await rpc.request(
      name === 'muse' ? 'session/start' : 'thread/start',
      name === 'muse'
        ? {
            commandId: uuid7(),
            workspaceRoot: input.cwd,
            modelId: input.spec.selection?.model,
            approvalMode: 'onRequest',
          }
        : { cwd: input.cwd, model: input.spec.selection?.model, sandbox: 'workspace-write', approvalPolicy: 'never' },
    );
    session = String(
      ((created.session ?? created.thread) as RpcValue | undefined)?.[name === 'muse' ? 'sessionId' : 'id'] ?? '',
    );
    if (!session) throw new Error('Agent did not return a session ID.');
    const started = await rpc.request('turn/start', {
      [name === 'muse' ? 'sessionId' : 'threadId']: session,
      input: [{ type: 'text', text: input.prompt }],
      ...(name === 'muse'
        ? { commandId: uuid7(), reasoningEffort: input.spec.selection?.effort }
        : { effort: input.spec.selection?.effort }),
    });
    turn = String(name === 'muse' ? started.turnId : ((started.turn as RpcValue | undefined)?.id ?? ''));
    if (!turn) throw new Error('Agent did not return a turn ID.');
    active = !finished;
    if (active)
      input.onSteering?.(async (text) => {
        if (!active || finished || input.abort?.aborted)
          throw new Error('This task has ended; your message was not sent.');
        const result = await rpc.request('turn/steer', {
          [name === 'muse' ? 'sessionId' : 'threadId']: session,
          expectedTurnId: turn,
          input: [{ type: 'text', text }],
          ...(name === 'muse' ? { commandId: uuid7() } : {}),
        });
        if (result.turnId !== turn)
          throw new Error(
            'Unexpected acknowledgement; delivery outcome unknown. Check the transcript before resending.',
          );
      });
    const code = await done;
    return { code, permissionSession };
  } finally {
    finish(1);
    clearTimeout(deadline);
    input.abort?.removeEventListener('abort', stop);
    await rpc.close();
  }
}
