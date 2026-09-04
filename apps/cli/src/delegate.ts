import { spawn, type ChildProcess } from 'node:child_process';
import { formatAdapterEvent, sanitizeEventPayload } from './ansi.js';
import type { AdapterSpec } from './adapters.js';

// A PAT reaches the whole account, not just one round.
export const CREATOR_TOKEN_PATTERN = /gdpl_(oat|pat)_/;

export function childEnv(parent: NodeJS.ProcessEnv, roundToken: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    if (CREATOR_TOKEN_PATTERN.test(value)) continue;
    if (/GAMEDEV_TOKEN|GDPL_OAT|GDPL_PAT|OAUTH_ACCESS/i.test(key)) continue;
    env[key] = value;
  }
  env.GAMEDEV_ROUND_TOKEN = roundToken;
  return env;
}

export function parseEventLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { text?: string; message?: string; type?: string };
    return parsed.text ?? parsed.message ?? parsed.type ?? trimmed;
  } catch {
    return null;
  }
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
  child.once('exit', () => clearTimeout(timer));
  input.abort?.addEventListener('abort', kill, { once: true });
  return child;
}
