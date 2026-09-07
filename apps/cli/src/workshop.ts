import { permissionBlocked } from './agent-events.js';
import { startLocalPlay } from './play.js';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ApiClient } from './api.js';
import { detectAdapter, loadAdapters, preflightAdapter, whichOnPath, type AdapterSpec } from './adapters.js';
import { cliUsage } from './bin-name.js';
import { formatSyncLines, inspectGame, type SyncResult } from './checkout.js';
import { childEnv, renderDelegateStream, spawnAdapter } from './delegate.js';
import { formatError } from './errors.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { formatSubmitLines, submitGame } from './submit.js';
import { getStatus, isTerminalStatus } from './turn.js';
import { runLadder } from './verify.js';
import type { CliTelemetry } from './telemetry.js';
import { prepareWorkspace } from './prepare-workspace.js';

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
  selectedAgent?: string;
  onActivity?: (activity: string) => void;
  telemetry?: CliTelemetry;
  builder: string;
  pick: PickChoice;
  // Ctrl+C aborts the running child through this, not the REPL.
  abort: { current: AbortController | null };
  runAdapter?: AdapterRun;
  run?: VerifyRun;
  // One-shot verb: no picks, first agent, deliver or not.
  unattended?: { deliver: boolean };
};

export type HandoffOutcome = { builder: string; pending: boolean };

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
  for (const stream of [child.stdout, child.stderr]) {
    if (stream) createInterface({ input: stream }).on('line', (line: string) => input.onLine?.(line));
  }
  return {
    code: await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    }),
  };
}

export function workshopBrief(slug: string, request: string, ack?: string): string {
  return [
    `You are editing the gamedev.pl game "${slug}". This directory is its source tree (games/${slug} in the checkout).`,
    `Creator request: ${request}`,
    ack ? `Studio understood it as: ${ack}` : '',
    'Change only files in this directory. Do not run git, install packages, or publish — the creator delivers with `gamedevpl submit`.',
    'If the creator wants to play, run `gamedevpl play` in this checkout; it opens a live preview without delivering or publishing. Use --no-open for a link only and --stop to close the server.',
    'The CLI runs typecheck and check:static after you exit. Do not run these checks yourself.',
    'This is a non-interactive task: do not wait for replies or approvals. If blocked, report the blocker and finish.',
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

// 202: the old builder owns the round until its agent acks.
export async function handoffBuilder(
  api: ApiClient,
  token: string,
  builder: 'self' | 'platform',
  current: string,
): Promise<HandoffOutcome> {
  const body = await api.request<{ pending?: boolean; builder?: string }>(
    'POST',
    `/api/submissions/${encodeURIComponent(token)}/handoff`,
    { builder, stopActivePlatformAgent: builder === 'self' },
  );
  if (body?.pending) return { builder: body.builder ?? current, pending: true };
  return { builder, pending: false };
}

export function handoffLine(outcome: HandoffOutcome, slug: string): string {
  if (outcome.pending) {
    return `handoff pending — builder stays ${outcome.builder} until its agent acknowledges; /builder re-checks`;
  }
  return outcome.builder === 'self'
    ? `builder self — your local agent edits games/${slug}; /builder platform hands it back`
    : `builder platform — say what to change and the platform builds; /pull when it lands`;
}

export async function refreshBuilder(api: ApiClient, ws: Pick<Workshop, 'token' | 'builder'>): Promise<string> {
  const round = await getStatus(api, ws.token);
  ws.builder = round.builder ?? ws.builder;
  return ws.builder;
}

// Asked once per session, only where a local agent could take over.
export async function settleBuilder(input: {
  api: ApiClient;
  ws: Pick<Workshop, 'token' | 'slug' | 'adapters' | 'builder' | 'pick' | 'selectedAgent' | 'telemetry'> &
    Partial<Pick<Workshop, 'env' | 'runAdapter'>>;
  status: string;
  write: (line: string) => void;
}): Promise<string> {
  const { ws } = input;
  if (!ws.adapters.length || ws.builder === 'self' || isTerminalStatus(input.status)) return ws.builder;
  const local = ws.adapters.map((spec) => `${spec.name} here — its own credentials and billing`);
  for (const spec of ws.adapters) ws.telemetry?.record('delegate_offered', spec.name);
  const choice = await ws.pick(
    [...local, 'the platform — uses your gamedev.pl quota; /pull afterwards'],
    `Who builds ${ws.slug}?`,
  );
  const selected = ws.adapters[local.indexOf(choice)];
  if (!selected) return ws.builder;
  try {
    if (ws.env && !ws.runAdapter) preflightAdapter(selected, ws.env);
    const outcome = await handoffBuilder(input.api, ws.token, 'self', ws.builder);
    ws.selectedAgent = selected.name;
    input.write(handoffLine(outcome, ws.slug));
    return outcome.builder;
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
      'no local agent on PATH — run gamedevpl agents to see supported tools',
      EXIT_REFUSED,
      '/builder platform lets the platform build instead',
    );
  }
  return spec;
}

export async function chooseAdapter(
  ws: Pick<Workshop, 'adapters' | 'env' | 'pick' | 'unattended' | 'selectedAgent'>,
  name?: string,
): Promise<AdapterSpec> {
  const selected = ws.selectedAgent;
  delete ws.selectedAgent;
  if (!name && selected) return pickAdapter(ws, selected);
  if (name || ws.adapters.length < 2 || ws.unattended) return pickAdapter(ws, name);
  const chosen = await ws.pick(
    ws.adapters.map((spec) => spec.name),
    'Which agent?',
  );
  if (!ws.adapters.some((spec) => spec.name === chosen)) {
    throw new CliError('agent selection cancelled', EXIT_REFUSED, '/delegate when ready');
  }
  return pickAdapter(ws, chosen);
}

export async function runLocalBuild(input: {
  ws: Workshop;
  spec: AdapterSpec;
  brief: string;
  write: (line: string) => void;
}): Promise<boolean> {
  const { ws, spec } = input;
  ws.onActivity?.(`Preparing ${spec.name}`);
  if (!ws.runAdapter) preflightAdapter(spec, ws.env);
  const cwd = spec.cwd === 'game-dir' ? join(ws.root, 'games', ws.slug) : ws.root;
  const controller = new AbortController();
  ws.abort.current = controller;
  input.write(`▸ ${spec.name} is working in games/${ws.slug} — Ctrl+C stops it`);
  let result: { code: number | null };
  let blocked = false;
  try {
    if (!ws.runAdapter)
      await prepareWorkspace({ cwd: ws.root, env: ws.env, abort: controller.signal, write: input.write });
    if (!ws.runAdapter && !ws.unattended) {
      try {
        const preview = await startLocalPlay({
          root: ws.root,
          slug: ws.slug,
          env: ws.env,
          write: input.write,
          prepared: true,
          abort: controller.signal,
        });
        if (preview) input.write(`live preview while ${spec.name} edits: ${preview.url}`);
      } catch (error) {
        input.write(formatError(error));
      }
    }
    if (controller.signal.aborted) return false;
    ws.onActivity?.(`${spec.name} is editing locally — input returns when it finishes`);
    input.write(`${spec.name} controls this local editing task; Ctrl+C stops it.`);
    if (spec.name === 'claude')
      input.write(
        'Claude uses subscription login; API authentication is refused. This local task is not linked to Claude Desktop.',
      );
    ws.telemetry?.record('delegate_used', spec.name);
    result = await (ws.runAdapter ?? defaultAdapterRun)({
      spec,
      prompt: input.brief,
      cwd,
      env: childEnv(ws.env, ''),
      abort: controller.signal,
      onLine: (line) => {
        if (permissionBlocked(line)) blocked = true;
        for (const shown of renderDelegateStream(spec.name, [line], false)) {
          if (shown.includes('⚙ ')) ws.onActivity?.(`${spec.name} · ${shown.split('⚙ ')[1]!.slice(0, 90)}`);
          input.write(shown);
        }
      },
    });
  } finally {
    ws.abort.current = null;
  }
  if (blocked) {
    input.write(
      `${spec.name} could not obtain tool permissions in headless mode. No successful edit is confirmed; review its permissions for this game directory and retry.`,
    );
    return false;
  }
  if (controller.signal.aborted) {
    input.write(`${spec.name} stopped — the tree keeps whatever it wrote; /diff to see`);
    return false;
  }
  if ((result.code ?? 1) !== 0) {
    input.write(`${spec.name} exited ${result.code ?? 'null'} — /diff to see what changed`);
    return false;
  }
  ws.onActivity?.('Agent finished — verifying typecheck and static checks');
  input.write('verifying — typecheck, check:static');
  const verify = runLadder({ cwd: ws.root, publish: false, run: ws.run });
  if (!verify.ok) {
    ws.telemetry?.record('verify_failed', spec.name, verify.stage);
    const detail = verify.detail.trim();
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
  const choice = ws.unattended
    ? ws.unattended.deliver
      ? deliver
      : ''
    : await ws.pick([deliver, 'not yet — keep editing'], `Deliver ${ws.slug}?`);
  if (choice !== deliver) {
    input.write('kept locally — /submit when ready');
    return;
  }
  try {
    const result = await submitGame({ api: input.api, slug: ws.slug, dest: ws.root, run: ws.run });
    if (result.kind === 'delivered') ws.telemetry?.record('delivered');
    input.write(formatSubmitLines(result, ws.slug).join('\n'));
  } catch (error) {
    input.write(formatError(error));
  }
}

// Only a self-owned, synchronized checkout may be edited locally.
export async function readyToEdit(input: {
  api: ApiClient;
  ws: Workshop;
  write: (line: string) => void;
}): Promise<boolean> {
  const { ws } = input;
  if (ws.builder !== 'self') {
    input.write(`builder is ${ws.builder} — /builder self takes the round here first`);
    return false;
  }
  try {
    const { sync } = await inspectGame({ api: input.api, slug: ws.slug, dest: ws.root });
    const warning = syncWarning(sync);
    if (warning) {
      input.write(`! ${warning}`);
      return false;
    }
    return true;
  } catch (error) {
    input.write(`cannot check the checkout against the platform — ${formatError(error)}`);
    return false;
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
  if (!(await readyToEdit(input))) return false;
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
