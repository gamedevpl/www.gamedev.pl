// Runs a reviewer's policy in the frame; returns what it saw.

// A plan cannot branch; see docs/agent-play-mode.md.

import { postGameHostMessage } from './gamePlayer.js';
import type { PlanSnapshot } from './agentPlan.js';

export type PolicyLogLine = { frame: number; kind: string; text: string };
export type PolicyWatchPoint = { frame: number; name: string; value: unknown };
export type PolicyShot = { name: string; frame: number; png: string | null };

export type PolicyResult = {
  outcome: 'completed' | 'failed';
  // The thrown message and stack, when the policy broke.
  message: string | null;
  frames: number;
  ms: number;
  logs: PolicyLogLine[];
  watches: PolicyWatchPoint[];
  shots: PolicyShot[];
  snapshot: PlanSnapshot;
  hiddenFields: string[] | null;
};

// Long enough for a play window, short enough to spot a hang.
const RESULT_TIMEOUT_MS = 60_000;
export const DEFAULT_POLICY_BUDGET = 3600;

function asString(value: unknown, max: number): string {
  return String(value ?? '').slice(0, max);
}

function readLogs(value: unknown): PolicyLogLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      frame: Number(entry.frame) || 0,
      kind: asString(entry.kind, 16),
      text: asString(entry.text, 400),
    }));
}

function readWatches(value: unknown): PolicyWatchPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({ frame: Number(entry.frame) || 0, name: asString(entry.name, 40), value: entry.value }));
}

function readShots(value: unknown): PolicyShot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      name: asString(entry.name, 60),
      frame: Number(entry.frame) || 0,
      png: typeof entry.png === 'string' && entry.png ? entry.png : null,
    }));
}

export function runAgentPolicy(
  frame: HTMLIFrameElement | null,
  source: string,
  options: { budget?: number; timeoutMs?: number } = {},
): Promise<PolicyResult> {
  const contentWindow = frame?.contentWindow;
  if (!contentWindow) return Promise.reject(new Error('the game frame went away'));
  const timeoutMs = options.timeoutMs ?? RESULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('the policy never came back — it may be looping without stepping'));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.origin !== 'null') return;
      if (event.source !== null && event.source !== contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.source !== 'gdpl-player' || data.type !== 'agent:policy-result') return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve({
        outcome: data.outcome === 'failed' ? 'failed' : 'completed',
        message: typeof data.message === 'string' ? data.message.slice(0, 600) : null,
        frames: Number(data.frames) || 0,
        ms: Number(data.ms) || 0,
        logs: readLogs(data.logs),
        watches: readWatches(data.watches),
        shots: readShots(data.shots),
        snapshot: (data.snapshot ?? {}) as PlanSnapshot,
        hiddenFields: Array.isArray(data.hiddenFields) ? data.hiddenFields.map((f) => asString(f, 60)) : null,
      });
    }

    window.addEventListener('message', onMessage);
    // `code`, never `source`: that name is the envelope's sender tag.
    postGameHostMessage(frame, {
      type: 'agent:policy',
      code: source,
      budget: options.budget ?? DEFAULT_POLICY_BUDGET,
    });
  });
}

// The API a policy is handed, written out for the guide.
export const POLICY_API_HELP = [
  'function playAgent(agent) { … }   // the page calls this with the API below',
  '',
  'agent.step(n, draw)      advance n frames; draw only when you want to look',
  'agent.press(key, n)      hold a key across n frames ("left", "space", "a", "Enter")',
  'agent.tap(key)           one frame held',
  'agent.down(key) / up(key)',
  'agent.click(x, y)        0..1 of the canvas; agent.move, agent.drag(x1,y1,x2,y2,n)',
  'agent.tilt(x, y)         -1..1, for games that read a phone',
  'agent.restart()          after won or lost',
  '',
  'agent.state()            the game’s own snapshot, as an object',
  'agent.observation()      its description of the screen, parsed when it is JSON',
  'agent.ui()               registered widgets with 0..1 bounds',
  'agent.frame()            frames elapsed; framesUsed() / framesLeft() for the budget',
  'agent.game()             window.GameKit; agent.canvas() the canvas element',
  '',
  'agent.log(...)           a line in the transcript (console.log is captured too)',
  'agent.watch(name, value) a named series over the run — a trajectory, not a snapshot',
  'agent.capture(name)      paint and keep this frame for the filmstrip',
].join('\n');

// A starting policy, so the box is never a blank page.
export const POLICY_EXAMPLE = `function playAgent(agent) {
  // Get past whatever the intro wants.
  for (let i = 0; i < 20 && agent.state().state !== 'playing'; i++) {
    agent.tap('Enter');
    agent.step(5);
  }
  agent.log('after intro:', agent.state());
  agent.capture('round-start');

  // Play, and watch what moves. A trajectory is what tells you whether input lands.
  for (let turn = 0; turn < 30; turn++) {
    const before = agent.state();
    agent.press('right', 10);
    const after = agent.state();
    agent.watch('score', after.score);
    agent.watch('state', after.state);
    if (JSON.stringify(before) === JSON.stringify(after)) {
      agent.log('nothing changed at frame', agent.frame(), '— input may not reach this game');
      break;
    }
    if (after.state === 'won' || after.state === 'lost') {
      agent.log('round ended:', after.state, 'at frame', agent.frame());
      break;
    }
  }
  agent.capture('end');
}`;
