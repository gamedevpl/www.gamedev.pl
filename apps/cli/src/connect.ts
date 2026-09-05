import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ApiClient } from './api.js';
import { detectAdapter, loadAdapters, whichOnPath, type AdapterSpec } from './adapters.js';
import { cliUsage } from './bin-name.js';
import { CREATOR_TOKEN_PATTERN, childEnv, renderDelegateStream, spawnAdapter } from './delegate.js';
import { CliError, EXIT_AUTH, EXIT_INPUT, EXIT_RED, EXIT_REFUSED } from './exit-codes.js';
import { studioToken } from './studio.js';

export type ConnectPayload = {
  mcpUrl?: string;
  kickoffPrompt?: string;
  authorizationHeader?: string;
  authorizationHeaderMasked?: string;
  installSnippets?: { claudeCode?: string; cli?: string };
  slug?: string;
};

export type AdapterRun = (input: {
  spec: AdapterSpec;
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}) => Promise<{ code: number | null; lines: string[] }>;

async function defaultAdapterRun(input: {
  spec: AdapterSpec;
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ code: number | null; lines: string[] }> {
  const child = spawnAdapter({ ...input, timeoutMs: 10 * 60_000 });
  const lines: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => {
    lines.push(...String(chunk).split('\n'));
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    lines.push(...String(chunk).split('\n'));
  });
  const code = await new Promise<number | null>((resolve) => {
    child.once('exit', (value) => resolve(value));
  });
  return { code, lines };
}

function authorizationValue(header: string): string {
  return header.replace(/^Authorization:\s*/i, '');
}

function installHeader(header: string): string {
  return /^Authorization:/i.test(header) ? header : `Authorization: ${header}`;
}

export function claudeMcpAddCommand(mcpUrl: string, authorizationHeader: string): string {
  return `claude mcp add --transport http gamedevpl ${mcpUrl} --header "${installHeader(authorizationHeader)}"`;
}

function mcpConfigBody(payload: ConnectPayload): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        gamedevpl: {
          type: 'http',
          url: payload.mcpUrl,
          headers: { Authorization: authorizationValue(payload.authorizationHeader ?? '') },
        },
      },
    },
    null,
    2,
  )}\n`;
}

function formatHandoff(payload: ConnectPayload, slug: string): string[] {
  const lines = [`MCP handoff for ${payload.slug ?? slug}`];
  if (payload.mcpUrl) lines.push(`mcp: ${payload.mcpUrl}`);
  if (payload.authorizationHeaderMasked) lines.push(`auth: ${payload.authorizationHeaderMasked}`);
  if (payload.mcpUrl && payload.authorizationHeader) {
    lines.push('install:');
    lines.push(`  ${claudeMcpAddCommand(payload.mcpUrl, payload.authorizationHeader)}`);
  }
  if (payload.kickoffPrompt) {
    lines.push('kickoff:');
    lines.push(payload.kickoffPrompt);
  }
  return lines;
}

function requireMcpAuth(payload: ConnectPayload | null): asserts payload is ConnectPayload & {
  mcpUrl: string;
  authorizationHeader: string;
} {
  if (!payload?.mcpUrl || !payload.authorizationHeader) {
    throw new CliError(
      'connect payload has no MCP authorization; re-run `gamedevpl login`',
      EXIT_AUTH,
      cliUsage('login'),
    );
  }
  if (CREATOR_TOKEN_PATTERN.test(payload.authorizationHeader)) {
    throw new CliError(
      'connect payload has no MCP authorization; re-run `gamedevpl login`',
      EXIT_AUTH,
      cliUsage('login'),
    );
  }
}

function withMcpConfig(spec: AdapterSpec, mcpPath: string): AdapterSpec {
  if (spec.name !== 'claude') return spec;
  return { ...spec, headless: [...spec.headless, '--mcp-config', mcpPath] };
}

export async function connectGame(input: {
  api: ApiClient;
  slug: string;
  dest: string;
  env?: NodeJS.ProcessEnv;
  agent?: string;
  handoff?: boolean;
  which?: (cmd: string) => string | null;
  runAdapter?: AdapterRun;
  write: (line: string) => void;
}): Promise<{ spawned: boolean; mcp: boolean }> {
  const env = input.env ?? process.env;
  const token = await studioToken(input.api, input.slug);
  const spec = input.agent
    ? detectAdapter(input.agent, input.which ?? ((cmd) => whichOnPath(cmd, env)), loadAdapters(env))
    : null;
  if (input.agent && !spec) {
    throw new CliError(
      `adapter ${input.agent} is not on PATH`,
      EXIT_INPUT,
      `install ${input.agent}, or omit --agent for the MCP handoff`,
    );
  }
  if (input.handoff) {
    await input.api.request('POST', `/api/submissions/${encodeURIComponent(token)}/handoff`, {
      builder: 'self',
      stopActivePlatformAgent: true,
    });
  }

  let payload: ConnectPayload;
  try {
    payload = await input.api.request<ConnectPayload>('GET', `/api/submissions/${encodeURIComponent(token)}/connect`);
  } catch (error) {
    if (error instanceof CliError && error.exitCode === EXIT_AUTH) throw error;
    throw new CliError(
      'connect unavailable — switch this round to self in Studio, or pass --handoff',
      EXIT_REFUSED,
      `${cliUsage('connect', input.slug)} --handoff`,
    );
  }

  if (payload?.mcpUrl) {
    for (const line of formatHandoff(payload, input.slug)) input.write(line);
  }

  if (!input.agent) {
    if (!payload?.mcpUrl) {
      throw new CliError(
        'connect unavailable — not a self round',
        EXIT_REFUSED,
        `${cliUsage('connect', input.slug)} --handoff`,
      );
    }
    return { spawned: false, mcp: true };
  }
  if (!spec) {
    throw new CliError(
      `adapter ${input.agent} is not on PATH`,
      EXIT_INPUT,
      `install ${input.agent}, or omit --agent for the MCP handoff`,
    );
  }
  requireMcpAuth(payload);

  mkdirSync(input.dest, { recursive: true });
  writeFileSync(join(input.dest, '.mcp.json'), mcpConfigBody(payload));
  const mcpPath = join(tmpdir(), `gamedev-mcp-${randomUUID()}.json`);
  writeFileSync(mcpPath, mcpConfigBody(payload));
  try {
    const cwd = spec.cwd === 'game-dir' ? join(input.dest, 'games', input.slug) : input.dest;
    const result = await (input.runAdapter ?? defaultAdapterRun)({
      spec: withMcpConfig(spec, mcpPath),
      prompt:
        payload.kickoffPrompt ?? `Edit ${input.slug} in this checkout. The creator will deliver with gamedevpl submit.`,
      cwd,
      env: childEnv(env, '', { url: payload.mcpUrl, authorization: payload.authorizationHeader }),
    });
    for (const line of renderDelegateStream(spec.name, result.lines, false)) input.write(line);
    if ((result.code ?? 1) !== 0) {
      throw new CliError(`${spec.name} exited ${result.code ?? 'null'}`, EXIT_RED, cliUsage('submit'));
    }
    input.write(`adapter finished — review the tree, then ${cliUsage('submit')}`);
    return { spawned: true, mcp: true };
  } finally {
    rmSync(mcpPath, { force: true });
  }
}
