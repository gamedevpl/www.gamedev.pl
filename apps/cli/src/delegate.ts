import { spawn, type ChildProcess } from 'node:child_process';
import { scrubEnv } from 'genaicode/agents';

// A PAT reaches the whole account, not just one round.
export const CREATOR_TOKEN_PATTERN = /gdpl_(oat|pat)_/;

export type ChildMcp = { url: string; authorization: string };

export function childEnv(parent: NodeJS.ProcessEnv, roundToken: string, mcp?: ChildMcp): NodeJS.ProcessEnv {
  const env = scrubEnv(parent, {
    names: [/GAMEDEV_TOKEN|GAMEDEV_ACCESS_TOKEN|GDPL_OAT|GDPL_PAT|OAUTH_ACCESS/i, 'GAMEDEV_ROUND_TOKEN'],
    values: [CREATOR_TOKEN_PATTERN],
  });
  if (roundToken && !CREATOR_TOKEN_PATTERN.test(roundToken)) env.GAMEDEV_ROUND_TOKEN = roundToken;
  if (mcp) {
    env.GAMEDEVPL_MCP_URL = mcp.url;
    if (!CREATOR_TOKEN_PATTERN.test(mcp.authorization)) env.GAMEDEVPL_MCP_AUTHORIZATION = mcp.authorization;
  }
  return env;
}

export function spawnCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  abort?: AbortSignal;
}): ChildProcess {
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      if (child.pid) process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  };
  const kill = () => {
    signalGroup('SIGTERM');
    escalation ??= setTimeout(() => signalGroup('SIGKILL'), 2_000);
  };
  const timer = setTimeout(kill, input.timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    clearTimeout(escalation);
    input.abort?.removeEventListener('abort', kill);
  };
  child.once('close', cleanup);
  child.once('error', cleanup);
  input.abort?.addEventListener('abort', kill, { once: true });
  if (input.abort?.aborted) kill();
  return child;
}
