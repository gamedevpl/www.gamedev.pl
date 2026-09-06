import { join } from 'node:path';
import type { ApiClient } from './api.js';
import { detectAdapter, loadAdapters, whichOnPath, type AdapterSpec } from './adapters.js';
import { cliUsage } from './bin-name.js';
import { formatSyncLines, inspectGame, type SyncResult } from './checkout.js';
import { childEnv, renderDelegateStream, spawnAdapter } from './delegate.js';
import { formatError } from './errors.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { formatSubmitLines, submitGame } from './submit.js';
import { getStatus, isTerminalStatus } from './turn.js';
import { runLadder } from './verify.js';

export type PickChoice = (choices: string[], question: string) => Promise<string>;

export type AdapterRun = (input: {
  spec: AdapterSpec;
  prompt: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  abort?: AbortSignal;
  onLine?: (line: string) => void;
}) => Promise<{ code: number | null }>;

type VerifyRun = NonNullable<Parameters<typeof runLadder>[0]['run']>;

export type Workshop = {
  slug: string;
  root: string;
  token: string;
  env: NodeJS.ProcessEnv;
  adapters: AdapterSpec[];
  builder: string;
  pick: PickChoice;
  // Ctrl+C aborts the running child through this, not the REPL.
  abort: { current: AbortController | null };
  runAdapter?: AdapterRun;
  run?: VerifyRun;
};

export const ADAPTER_TIMEOUT_MS = 30 * 60_000;

export function detectLocalAdapters(
  env: NodeJS.ProcessEnv,
  which: (cmd: string) => string | null = (cmd) => whichOnPath(cmd, env),
): AdapterSpec[] {
  const file = loadAdapters(env);
  return file.adapters.flatMap((row) => {
    const spec = detectAdapter(row.name, which, file);
    return spec ? [spec] : [];
  });
}

async function defaultAdapterRun(input: Parameters<AdapterRun>[0]): Promise<{ code: number | null }> {
  const child = spawnAdapter({ ...input, timeoutMs: ADAPTER_TIMEOUT_MS });
  const feed = (chunk: Buffer): void => {
    for (const line of String(chunk).split('\n')) if (line.trim()) input.onLine?.(line);
  };
  child.stdout?.on('data', feed);
  child.stderr?.on('data', feed);
  return { code: await new Promise<number | null>((resolve) => child.once('exit', (value) => resolve(value))) };
}

export function workshopBrief(slug: string, request: string, ack?: string): string {
  return [
    `You are editing the gamedev.pl game "${slug}". This directory is its source tree (games/${slug} in the checkout).`,
    `Creator request: ${request}`,
    ack ? `Studio understood it as: ${ack}` : '',
    'Change only files in this directory. Do not run git, install packages, or publish — the creator delivers with `gamedevpl submit`.',
    'When done, `npm run typecheck` and `npm run check:static` at the checkout root must pass.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function describeAdapters(adapters: AdapterSpec[], all = loadAdapters().adapters): string {
  if (adapters.length) return `local agents: ${adapters.map((spec) => spec.name).join(', ')}`;
  return `no local agent on PATH (${all.map((spec) => spec.name).join(', ')}) — the platform builds; /pull afterwards`;
}

export function syncWarning(sync: SyncResult): string | null {
  if (sync.kind === 'platform_only') return `the platform is ahead (${sync.platform.join(', ')}) — /pull first`;
  if (sync.kind === 'conflict') return `conflict on ${sync.conflict.join(', ')} — /diff before editing`;
  if (sync.kind === 'legacy') return `no base version here — ${cliUsage('checkout', '<slug>')} again for a clean copy`;
  return null;
}

export async function openWorkshop(input: {
  api: ApiClient;
  token: string;
  slug: string;
  root: string;
  env: NodeJS.ProcessEnv;
  which?: (cmd: string) => string | null;
  write: (line: string) => void;
}): Promise<{ adapters: AdapterSpec[]; builder: string; status: string }> {
  const adapters = detectLocalAdapters(input.env, input.which);
  input.write(`◆ ${input.slug} — the checkout at ${input.root}`);
  try {
    const { sync } = await inspectGame({ api: input.api, slug: input.slug, dest: input.root });
    input.write(formatSyncLines(sync).join('\n'));
    const warning = syncWarning(sync);
    if (warning) input.write(`! ${warning}`);
  } catch (error) {
    input.write(formatError(error));
  }
  input.write(describeAdapters(adapters));
  let builder = 'platform';
  let status = '';
  try {
    const round = await getStatus(input.api, input.token);
    builder = round.builder ?? 'platform';
    status = round.status;
    input.write(`builder ${builder} · ${status}`);
  } catch (error) {
    input.write(formatError(error));
  }
  return { adapters, builder, status };
}

export async function handoffBuilder(api: ApiClient, token: string, builder: 'self' | 'platform'): Promise<string> {
  await api.request('POST', `/api/submissions/${encodeURIComponent(token)}/handoff`, {
    builder,
    stopActivePlatformAgent: builder === 'self',
  });
  return builder;
}

// Asked once per session, only where a local agent could take over.
export async function settleBuilder(input: {
  api: ApiClient;
  ws: Pick<Workshop, 'token' | 'slug' | 'adapters' | 'builder' | 'pick'>;
  status: string;
  write: (line: string) => void;
}): Promise<string> {
  const { ws } = input;
  if (!ws.adapters.length || ws.builder === 'self' || isTerminalStatus(input.status)) return ws.builder;
  const local = `${ws.adapters[0]!.name} here, in this checkout`;
  const choice = await ws.pick([local, 'the platform — I will /pull afterwards'], `Who builds ${ws.slug}?`);
  if (choice !== local) return ws.builder;
  try {
    const builder = await handoffBuilder(input.api, ws.token, 'self');
    input.write(`builder self — ${ws.adapters[0]!.name} edits games/${ws.slug}; /builder platform hands it back`);
    return builder;
  } catch (error) {
    input.write(`${formatError(error)}\nthe platform keeps building — /builder self to retry`);
    return ws.builder;
  }
}

export function pickAdapter(ws: Pick<Workshop, 'adapters' | 'env'>, name?: string): AdapterSpec {
  if (name) {
    const spec =
      ws.adapters.find((row) => row.name === name) ??
      detectAdapter(name, (cmd) => whichOnPath(cmd, ws.env), loadAdapters(ws.env));
    if (!spec) throw new CliError(`adapter ${name} is not on PATH`, EXIT_INPUT, `install ${name}, or omit --agent`);
    return spec;
  }
  const spec = ws.adapters[0];
  if (!spec) {
    throw new CliError(
      'no local agent on PATH — install claude, codex, gemini or vibe',
      EXIT_REFUSED,
      '/builder platform lets the platform build instead',
    );
  }
  return spec;
}

export async function chooseAdapter(
  ws: Pick<Workshop, 'adapters' | 'env' | 'pick'>,
  name?: string,
): Promise<AdapterSpec> {
  if (name || ws.adapters.length < 2) return pickAdapter(ws, name);
  const chosen = await ws.pick(
    ws.adapters.map((spec) => spec.name),
    'Which agent?',
  );
  return pickAdapter(ws, chosen || ws.adapters[0]!.name);
}

export async function runLocalBuild(input: {
  ws: Workshop;
  spec: AdapterSpec;
  brief: string;
  write: (line: string) => void;
}): Promise<boolean> {
  const { ws, spec } = input;
  const cwd = spec.cwd === 'game-dir' ? join(ws.root, 'games', ws.slug) : ws.root;
  const controller = new AbortController();
  ws.abort.current = controller;
  input.write(`▸ ${spec.name} is working in games/${ws.slug} — Ctrl+C stops it`);
  let result: { code: number | null };
  try {
    result = await (ws.runAdapter ?? defaultAdapterRun)({
      spec,
      prompt: input.brief,
      cwd,
      env: childEnv(ws.env, ''),
      abort: controller.signal,
      onLine: (line) => {
        for (const shown of renderDelegateStream(spec.name, [line], false)) input.write(shown);
      },
    });
  } finally {
    ws.abort.current = null;
  }
  if (controller.signal.aborted) {
    input.write(`${spec.name} stopped — the tree keeps whatever it wrote; /diff to see`);
    return false;
  }
  if ((result.code ?? 1) !== 0) {
    input.write(`${spec.name} exited ${result.code ?? 'null'} — /diff to see what changed`);
    return false;
  }
  input.write('verifying — typecheck, check:static');
  const verify = runLadder({ cwd: ws.root, publish: false, run: ws.run });
  if (!verify.ok) {
    const detail = verify.detail.split('\n').find((line) => line.trim()) ?? '';
    input.write(`verify failed at ${verify.stage}${detail ? `: ${detail}` : ''}\nfix by hand, or ask again`);
    return false;
  }
  input.write('✓ static ladder green');
  return true;
}

export async function offerSubmit(input: {
  api: ApiClient;
  ws: Workshop;
  write: (line: string) => void;
}): Promise<void> {
  const { ws } = input;
  const deliver = 'deliver a preview';
  const choice = await ws.pick([deliver, 'not yet — keep editing'], `Deliver ${ws.slug}?`);
  if (choice !== deliver) {
    input.write('kept locally — /submit when ready');
    return;
  }
  try {
    const result = await submitGame({ api: input.api, slug: ws.slug, dest: ws.root, run: ws.run });
    input.write(formatSubmitLines(result, ws.slug).join('\n'));
  } catch (error) {
    input.write(formatError(error));
  }
}

// One creator request, end to end: agent, ladder, offer.
export async function workshopTurn(input: {
  api: ApiClient;
  ws: Workshop;
  request: string;
  ack?: string;
  agent?: string;
  write: (line: string) => void;
}): Promise<boolean> {
  const spec = await chooseAdapter(input.ws, input.agent);
  const ok = await runLocalBuild({
    ws: input.ws,
    spec,
    brief: workshopBrief(input.ws.slug, input.request, input.ack),
    write: input.write,
  });
  if (ok) await offerSubmit(input);
  return ok;
}
