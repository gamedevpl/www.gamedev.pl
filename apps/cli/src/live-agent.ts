import {
  codexNotification,
  liveAgent,
  museNotification,
  RpcError,
  uuidv7,
  type AgentOutcome,
  type AgentRun,
  type LiveSession,
} from 'genaicode/agents';
import type { AdapterSpec } from './adapters.js';
import type { AdapterRunInput } from './headless-agent.js';
import { evidenceImages } from './workbench-evidence.js';

type RpcValue = Record<string, unknown>;
export type Steer = (text: string) => Promise<void>;

const ACK_TIMEOUT_MS = 30_000;
const TASK_TIMEOUT_MS = 30 * 60_000;
export const MUSE_APPROVAL_LINE = 'Muse needs your approval — returning to permission handoff.';

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
// Codex reads staged screenshots as images, not only as file paths.
export function turnInput(name: string, text: string): RpcValue[] {
  const images = name === 'codex' ? evidenceImages(text) : [];
  return [{ type: 'text', text }, ...images.map((path) => ({ type: 'localImage', path }))];
}

// Transport and events come from genaicode/agents; protocol choices stay here.
export async function runLiveAgent(input: AdapterRunInput): Promise<{ code: number; permissionSession?: string }> {
  const args = liveArgs(input.spec);
  if (!args) throw new Error('This adapter supports queued follow-ups only.');
  let permissionSession: string | undefined;
  let accepting = false;
  let decided = false;
  const steering = (open: boolean) => {
    accepting = open;
    input.onSteering?.(
      open
        ? async (text) => {
            if (!accepting || input.abort?.aborted) throw new Error('This task has ended; your message was not sent.');
            await run.steer!(text);
          }
        : undefined,
    );
  };
  const agent = liveAgent({
    name: input.spec.name,
    command: input.spec.command,
    args: () => args,
    drive: (session) =>
      drive(session, input, {
        steering,
        decided: () => {
          decided = true;
        },
        handoff: (id) => {
          permissionSession = id;
        },
      }),
  });
  const run: AgentRun = agent.run({
    prompt: input.prompt,
    cwd: input.cwd,
    env: input.env,
    signal: input.abort,
    timeoutMs: TASK_TIMEOUT_MS,
    model: input.spec.selection?.model,
    effort: input.spec.selection?.effort,
  });
  try {
    for await (const event of run) input.onEvent?.(event);
    const result = await run.result;
    if (!result.ok && !decided && result.status !== 'aborted' && result.error)
      input.onEvent?.({ type: 'error', message: result.error });
    return { code: result.ok ? 0 : 1, permissionSession };
  } finally {
    accepting = false;
    input.onSteering?.(undefined);
  }
}

async function drive(
  session: LiveSession,
  input: AdapterRunInput,
  hooks: { steering: (open: boolean) => void; decided: () => void; handoff: (id: string) => void },
): Promise<AgentOutcome> {
  const { rpc, task } = session;
  const name = input.spec.name;
  const muse = name === 'muse';
  const key = muse ? 'sessionId' : 'threadId';
  let id = '';
  let turn = '';
  let inFlight = 0;
  let verdict: AgentOutcome | undefined;
  let settle: (outcome: AgentOutcome) => void = () => {};
  const settled = new Promise<AgentOutcome>((resolve) => {
    settle = resolve;
  });
  // A steer sent just before the turn ended still gets its acknowledgement.
  const finish = (outcome: AgentOutcome) => {
    if (verdict) return;
    verdict = outcome;
    hooks.decided();
    hooks.steering(false);
    if (!outcome.ok || inFlight === 0) settle(outcome);
  };
  const diagnostic = (method: string, params: unknown) => input.onDiagnostic?.(JSON.stringify({ method, params }));

  session.onNotification((method, params) => {
    diagnostic(method, params);
    const value = (params ?? {}) as RpcValue;
    if (!id || value[key] !== id) return;
    if (method === 'turn/completed') {
      const ended = value.turn as RpcValue | undefined;
      if (turn && (muse ? value.turnId : ended?.id) !== turn) return;
      const status = muse ? value.terminal : ended?.status;
      const error = (value.error ?? ended?.error) as RpcValue | undefined;
      if (typeof error?.message === 'string' && error.message) session.emit({ type: 'error', message: error.message });
      finish(
        status === 'completed' ? { ok: true } : { ok: false, error: `${name} turn ${String(status ?? 'ended')}.` },
      );
      return;
    }
    for (const event of (muse ? museNotification : codexNotification)(method, params)) session.emit(event);
  });
  session.onRequest((method, params) => {
    diagnostic(method, params);
    if (muse && method === 'approval/request') {
      hooks.handoff(id);
      session.emit({ type: 'error', message: MUSE_APPROVAL_LINE });
      finish({ ok: false, error: MUSE_APPROVAL_LINE });
    }
    throw new RpcError('This client cannot grant this request.', -32601);
  });

  await rpc.request(
    'initialize',
    { clientInfo: { name: 'gamedevpl', version: '1' }, ...(muse ? { capabilities: { userInputDialogs: false } } : {}) },
    ACK_TIMEOUT_MS,
  );
  rpc.notify('initialized');
  const created = (await rpc.request(
    muse ? 'session/start' : 'thread/start',
    muse
      ? { commandId: uuidv7(), workspaceRoot: task.cwd, modelId: task.model, approvalMode: 'onRequest' }
      : { cwd: task.cwd, model: task.model, sandbox: 'workspace-write', approvalPolicy: 'never' },
    ACK_TIMEOUT_MS,
  )) as RpcValue;
  id = String(((created.session ?? created.thread) as RpcValue | undefined)?.[muse ? 'sessionId' : 'id'] ?? '');
  if (!id) throw new Error('Agent did not return a session ID.');
  session.emit({ type: 'session', sessionId: id });
  const started = (await rpc.request(
    'turn/start',
    {
      [key]: id,
      input: turnInput(name, task.prompt),
      ...(muse ? { commandId: uuidv7(), reasoningEffort: task.effort } : { effort: task.effort }),
    },
    ACK_TIMEOUT_MS,
  )) as RpcValue;
  turn = String(muse ? started.turnId : ((started.turn as RpcValue | undefined)?.id ?? ''));
  if (!turn) throw new Error('Agent did not return a turn ID.');
  if (verdict) return settled;
  session.setSteer(async (text) => {
    inFlight++;
    try {
      const ack = (await rpc.request(
        'turn/steer',
        {
          [key]: id,
          expectedTurnId: turn,
          input: turnInput(name, text),
          ...(muse ? { commandId: uuidv7() } : {}),
        },
        ACK_TIMEOUT_MS,
      )) as RpcValue;
      if (ack.turnId !== turn)
        throw new Error('Unexpected acknowledgement; delivery outcome unknown. Check the transcript before resending.');
    } finally {
      inFlight--;
      if (verdict && inFlight === 0) settle(verdict);
    }
  });
  hooks.steering(true);
  return settled;
}
