import { spawn, type ChildProcess } from 'node:child_process';
import { formatAdapterEvent, sanitizeEventPayload } from './ansi.js';
import type { AdapterSpec } from './adapters.js';

// A PAT reaches the whole account, not just one round.
export const CREATOR_TOKEN_PATTERN = /gdpl_(oat|pat)_/;

export type ChildMcp = { url: string; authorization: string };

export function childEnv(parent: NodeJS.ProcessEnv, roundToken: string, mcp?: ChildMcp): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    if (CREATOR_TOKEN_PATTERN.test(value)) continue;
    if (/GAMEDEV_TOKEN|GAMEDEV_ACCESS_TOKEN|GDPL_OAT|GDPL_PAT|OAUTH_ACCESS/i.test(key)) continue;
    env[key] = value;
  }
  delete env.GAMEDEV_ROUND_TOKEN;
  if (roundToken && !CREATOR_TOKEN_PATTERN.test(roundToken)) env.GAMEDEV_ROUND_TOKEN = roundToken;
  if (mcp) {
    env.GAMEDEVPL_MCP_URL = mcp.url;
    if (!CREATOR_TOKEN_PATTERN.test(mcp.authorization)) env.GAMEDEVPL_MCP_AUTHORIZATION = mcp.authorization;
  }
  return env;
}

type EventShape = {
  text?: unknown;
  message?: unknown;
  type?: unknown;
  result?: unknown;
  item?: { type?: unknown; text?: unknown; command?: unknown };
};

const QUIET_EVENT_TYPES = /^(system|user|thread\.|turn\.|item\.started)/;

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

// Claude, codex and vibe each wrap text differently; show the words.
function contentText(message: unknown): string | null {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return null;
  const parts = (content as Array<{ type?: string; text?: string; name?: string }>).flatMap((block) => {
    if (block.type === 'text' && block.text) return [block.text];
    if (block.type === 'tool_use' && block.name) return [`⚙ ${block.name}`];
    return [];
  });
  return parts.length ? parts.join(' ') : null;
}

export function parseEventLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: EventShape;
  try {
    parsed = JSON.parse(trimmed) as EventShape;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return trimmed;
  const direct =
    textOf(parsed.text) ??
    textOf(parsed.message) ??
    contentText(parsed.message) ??
    textOf(parsed.result) ??
    textOf(parsed.item?.text);
  if (direct) return direct;
  const command = textOf(parsed.item?.command);
  if (command) return `⚙ ${command}`;
  const type = textOf(parsed.type);
  if (!type) return trimmed;
  return QUIET_EVENT_TYPES.test(type) ? null : type;
}

export function renderDelegateStream(adapter: string, lines: string[], verbose: boolean): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (verbose) out.push(`${adapter} raw ${sanitizeEventPayload(line)}`);
    const payload = parseEventLine(line);
    if (payload) out.push(formatAdapterEvent(adapter, payload));
  }
  return out;
}

export function spawnAdapter(input: {
  spec: AdapterSpec;
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  abort?: AbortSignal;
}): ChildProcess {
  const args = [...input.spec.headless, input.prompt];
  const child = spawn(input.spec.command, args, {
    cwd: input.cwd,
    env: input.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const kill = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  };
  const timer = setTimeout(kill, input.timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    input.abort?.removeEventListener('abort', kill);
  };
  child.once('close', cleanup);
  child.once('error', cleanup);
  input.abort?.addEventListener('abort', kill, { once: true });
  if (input.abort?.aborted) kill();
  return child;
}
