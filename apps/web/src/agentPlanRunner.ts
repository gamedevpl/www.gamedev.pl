// Runs a plan at full speed, with no model in the loop.

// One attempt is one submission; see docs/agent-play-mode.md.

import { postGameHostMessage } from './gamePlayer.js';
import { isFromGameFrame } from './frameMessage.js';
import type { AgentCommand } from './agentPlay.js';
import {
  commandForAction,
  describeCondition,
  evaluateCondition,
  type AgentPlan,
  type PlanAction,
  type PlanSnapshot,
} from './agentPlan.js';

export type PlanTraceEntry = { frame: number; action: string; snapshot: PlanSnapshot };
export type PlanCaptureEntry = { name: string; frame: number; png: string | null };
export type PlanCheck = { kind: 'assert' | 'waitFor'; text: string; passed: boolean; frame: number };

export type PlanRunResult = {
  frames: number;
  trace: PlanTraceEntry[];
  captures: PlanCaptureEntry[];
  checks: PlanCheck[];
  outcome: 'completed' | 'failed' | 'exhausted' | 'aborted';
  // Why a run stopped short, in the words the reviewer will quote.
  note: string | null;
  finalSnapshot: PlanSnapshot;
};

type Reply = { frame: number; snapshot: PlanSnapshot };
type Capture = { png: string | null; reply: Reply };

const REPLY_TIMEOUT_MS = 20_000;
const TRACE_CAP = 200;
// Evenly spaced frames when a plan asks for none.
const AUTO_CAPTURES = 6;

// Ids correlate replies: a screenshot answers twice and would shift the trace.
let nextCommandId = 0;

function awaitFrom(
  frame: HTMLIFrameElement | null,
  type: string,
  id: number,
  timeoutMs = REPLY_TIMEOUT_MS,
): Promise<unknown> {
  const contentWindow = frame?.contentWindow;
  if (!contentWindow) return Promise.reject(new Error('the game frame went away'));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error(`the game did not answer ${type} in time`));
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (!isFromGameFrame(event, contentWindow)) return;
      const data = event.data as { source?: string; type?: string; id?: unknown } | null;
      if (!data || data.source !== 'gdpl-player' || data.type !== type) return;
      if (data.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(data);
    }
    window.addEventListener('message', onMessage);
  });
}

async function send(frame: HTMLIFrameElement | null, command: AgentCommand, timeoutMs: number): Promise<Reply> {
  const id = ++nextCommandId;
  const reply = awaitFrom(frame, 'agent:state', id, timeoutMs);
  postGameHostMessage(frame, { type: 'agent:command', id, command });
  const data = (await reply) as { frame?: unknown; snapshot?: unknown };
  return { frame: Number(data.frame) || 0, snapshot: (data.snapshot ?? {}) as PlanSnapshot };
}

async function capture(frame: HTMLIFrameElement | null, timeoutMs: number): Promise<Capture> {
  const id = ++nextCommandId;
  const shot = awaitFrom(frame, 'agent:shot', id, timeoutMs);
  // The trailing state belongs here, not to the next command.
  const state = awaitFrom(frame, 'agent:state', id, timeoutMs);
  postGameHostMessage(frame, { type: 'agent:command', id, command: { kind: 'screenshot' } });
  const data = (await shot) as { png?: unknown };
  const after = (await state) as { frame?: unknown; snapshot?: unknown };
  return {
    png: typeof data.png === 'string' && data.png.length > 0 ? data.png : null,
    reply: { frame: Number(after.frame) || 0, snapshot: (after.snapshot ?? {}) as PlanSnapshot },
  };
}

function label(action: PlanAction): string {
  const [kind] = Object.keys(action);
  if (kind === 'press' && 'press' in action) return `press ${action.press.key} ${action.press.frames}`;
  if (kind === 'wait' && 'wait' in action) return `wait ${action.wait}`;
  if (kind === 'capture' && 'capture' in action) return `capture ${action.capture}`;
  if (kind === 'assert' && 'assert' in action) return `assert ${describeCondition(action.assert)}`;
  if (kind === 'waitFor' && 'waitFor' in action) return `waitFor ${describeCondition(action.waitFor)}`;
  return String(kind);
}

// Batches, because a 3600-frame wait would be 3600 round trips.
const WAIT_BATCH = 5;

export async function runAgentPlan(
  frame: HTMLIFrameElement | null,
  plan: AgentPlan,
  options: { onProgress?: (done: number, total: number) => void; timeoutMs?: number } = {},
): Promise<PlanRunResult> {
  const trace: PlanTraceEntry[] = [];
  const captures: PlanCaptureEntry[] = [];
  const checks: PlanCheck[] = [];
  let spent = 0;
  const timeoutMs = options.timeoutMs ?? REPLY_TIMEOUT_MS;
  let last: Reply = await send(frame, { kind: 'look' }, timeoutMs);
  const startFrame = last.frame;

  let outcome: PlanRunResult['outcome'] = 'completed';
  let note: string | null = null;
  let done = 0;

  const flat: PlanAction[] = [];
  const expand = (actions: PlanAction[]) => {
    for (const action of actions) {
      if ('repeat' in action) {
        for (let turn = 0; turn < action.repeat.times; turn++) expand(action.repeat.actions);
      } else {
        flat.push(action);
      }
    }
  };
  expand(plan.script);

  // Where the automatic filmstrip lands.
  const wantsAuto = !flat.some((action) => 'capture' in action);
  const autoEvery = wantsAuto ? Math.max(1, Math.floor(flat.length / AUTO_CAPTURES)) : 0;

  function record(action: PlanAction) {
    if (trace.length >= TRACE_CAP) return;
    trace.push({ frame: last.frame, action: label(action), snapshot: last.snapshot });
  }

  for (const [index, action] of flat.entries()) {
    if (spent >= plan.maxFrames) {
      outcome = 'exhausted';
      note = `the plan ran out of its ${plan.maxFrames} frames`;
      break;
    }

    try {
      if ('capture' in action) {
        const shot = await capture(frame, timeoutMs);
        captures.push({ name: action.capture, frame: last.frame, png: shot.png });
        last = shot.reply;
        record(action);
      } else if ('assert' in action) {
        const passed = evaluateCondition(action.assert, last.snapshot);
        checks.push({ kind: 'assert', text: describeCondition(action.assert), passed, frame: last.frame });
        record(action);
        if (!passed) {
          outcome = 'failed';
          note = `assert failed: ${describeCondition(action.assert)}`;
          break;
        }
      } else if ('waitFor' in action) {
        const budget = Math.min(action.waitFor.maxFrames ?? 120, plan.maxFrames - spent);
        let waited = 0;
        let passed = evaluateCondition(action.waitFor, last.snapshot);
        while (!passed && waited < budget) {
          const batch = Math.min(WAIT_BATCH, budget - waited);
          last = await send(frame, { kind: 'step', frames: batch }, timeoutMs);
          waited += batch;
          spent += batch;
          passed = evaluateCondition(action.waitFor, last.snapshot);
        }
        checks.push({ kind: 'waitFor', text: describeCondition(action.waitFor), passed, frame: last.frame });
        record(action);
        if (!passed) {
          outcome = 'failed';
          note = `waitFor never came true: ${describeCondition(action.waitFor)}`;
          break;
        }
      } else {
        const command = commandForAction(action);
        if (command) {
          // `wait 100` under a 10-frame plan ran all hundred; clamp instead.
          const wanted = 'frames' in command ? command.frames : 1;
          const left = plan.maxFrames - spent;
          const clamped = Math.min(wanted, left);
          if (clamped < wanted) {
            outcome = 'exhausted';
            note = `the plan ran out of its ${plan.maxFrames} frames`;
          }
          const before = last.frame;
          last = await send(frame, { ...command, ...('frames' in command ? { frames: clamped } : {}) }, timeoutMs);
          spent += Math.max(0, last.frame - before);
          record(action);
          if (outcome === 'exhausted') break;
        } else {
          record(action);
        }
      }
    } catch (error) {
      outcome = 'aborted';
      note = error instanceof Error ? error.message : 'the run stopped unexpectedly';
      break;
    }

    if (autoEvery && index % autoEvery === 0 && captures.length < AUTO_CAPTURES) {
      const auto = await capture(frame, timeoutMs).catch(() => null);
      captures.push({ name: `frame ${last.frame}`, frame: last.frame, png: auto?.png ?? null });
      if (auto) last = auto.reply;
    }
    done += 1;
    options.onProgress?.(done, flat.length);
  }

  // Every run ends on a frame: the last thing seen.
  if (wantsAuto || captures.length === 0) {
    const closing = await capture(frame, timeoutMs).catch(() => null);
    captures.push({ name: 'final', frame: last.frame, png: closing?.png ?? null });
  }

  return {
    frames: Math.max(spent, last.frame - startFrame),
    trace,
    captures,
    checks,
    outcome,
    note,
    finalSnapshot: last.snapshot,
  };
}
