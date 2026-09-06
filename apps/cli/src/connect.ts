import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { ApiClient } from './api.js';
import { detectAdapter, loadAdapters, whichOnPath, type AdapterSpec } from './adapters.js';
import { cliUsage } from './bin-name.js';
import { CREATOR_TOKEN_PATTERN, childEnv, renderDelegateStream, spawnAdapter } from './delegate.js';
import { CliError, EXIT_AUTH, EXIT_INPUT, EXIT_RED, EXIT_REFUSED } from './exit-codes.js';
import { studioToken } from './studio.js';
import { adapterMcpSupported } from './agents.js';
import { findCheckout } from './checkout.js';

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
  abort?: AbortSignal;
  onLine?: (line: string) => void;
}) => Promise<{ code: number | null; lines: string[] }>;

async function defaultAdapterRun(input: Parameters<AdapterRun>[0]): Promise<{ code: number | null; lines: string[] }> {
  const child = spawnAdapter({ ...input, timeoutMs: 10 * 60_000 });
  const lines: string[] = [];
  for (const stream of [child.stdout, child.stderr]) {
    if (stream)
      createInterface({ input: stream }).on('line', (line: string) => {
        if (input.onLine) input.onLine(line);
        else lines.push(line);
      });
  }
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (value) => resolve(value));
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

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function wireAdapterMcp(
  spec: AdapterSpec,
  payload: { mcpUrl: string; authorizationHeader: string },
): { spec: AdapterSpec; cleanup: string[] } {
  if (spec.name === 'claude') {
    const mcpPath = join(tmpdir(), `gamedev-mcp-${randomUUID()}.json`);
    writeFileSync(mcpPath, mcpConfigBody(payload));
    return { spec: { ...spec, headless: [...spec.headless, '--mcp-config', mcpPath] }, cleanup: [mcpPath] };
  }
  if (spec.name === 'codex') {
    const auth = authorizationValue(payload.authorizationHeader);
    return {
      spec: {
        ...spec,
        headless: [
          '-c',
          `mcp_servers.gamedevpl.url=${tomlString(payload.mcpUrl)}`,
          '-c',
          `mcp_servers.gamedevpl.http_headers={ Authorization = ${tomlString(auth)} }`,
          ...spec.headless,
        ],
      },
      cleanup: [],
    };
  }
  throw new CliError(
    `adapter ${spec.name} has no MCP wiring — use claude or codex, or omit --agent`,
    EXIT_INPUT,
    cliUsage('connect'),
  );
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
  abort?: AbortSignal;
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
  if (spec && !adapterMcpSupported(spec.name)) {
    throw new CliError(
      `adapter ${spec.name} has no MCP wiring — use claude or codex, or omit --agent`,
      EXIT_INPUT,
      cliUsage('connect'),
    );
  }
  if (input.handoff) {
    const outcome = await input.api.request<{ pending?: boolean }>(
      'POST',
      `/api/submissions/${encodeURIComponent(token)}/handoff`,
      {
        builder: 'self',
        stopActivePlatformAgent: true,
      },
    );
    if (outcome.pending) {
      throw new CliError(
        'handoff pending — the platform agent still owns this round',
        EXIT_REFUSED,
        'retry after the handoff completes',
      );
    }
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
  if (input.abort?.aborted) throw new CliError('agent launch cancelled', EXIT_REFUSED, 'retry when ready');

  const wired = wireAdapterMcp(spec, payload);
  try {
    const checkout = findCheckout(input.dest);
    const local = checkout?.slug === input.slug;
    const cwd = local
      ? spec.cwd === 'game-dir'
        ? join(checkout.root, 'games', input.slug)
        : checkout.root
      : mkdtempSync(join(tmpdir(), 'gamedev-mcp-work-'));
    if (!local) {
      input.write(`MCP workspace: ${cwd} — scratch files are kept here after the agent exits`);
      if (spec.name === 'codex') wired.spec.headless.push('--skip-git-repo-check');
    }
    const result = await (input.runAdapter ?? defaultAdapterRun)({
      spec: wired.spec,
      prompt:
        payload.kickoffPrompt ?? `Edit ${input.slug} in this checkout. The creator will deliver with gamedevpl submit.`,
      cwd,
      env: childEnv(env, '', { url: payload.mcpUrl, authorization: payload.authorizationHeader }),
      abort: input.abort,
      onLine: (line) => {
        for (const shown of renderDelegateStream(spec.name, [line], false)) input.write(shown);
      },
    });
    for (const line of renderDelegateStream(spec.name, result.lines, false)) input.write(line);
    if (input.abort?.aborted) {
      throw new CliError(
        `${spec.name} stopped — files remain at ${cwd}`,
        EXIT_REFUSED,
        'review the files before retrying',
      );
    }
    if ((result.code ?? 1) !== 0) {
      throw new CliError(`${spec.name} exited ${result.code ?? 'null'}`, EXIT_RED, cliUsage('submit'));
    }
    input.write(
      local
        ? `adapter finished — review the tree, then ${cliUsage('submit')}`
        : `adapter finished — check the round in Studio; scratch files remain at ${cwd}`,
    );
    return { spawned: true, mcp: true };
  } finally {
    for (const path of wired.cleanup) rmSync(path, { force: true });
  }
}
