import { bindSourceProject, sourceProject } from './source-project.js';

import { withCheckoutWriter } from './workbench-lock.js';
import { readLocalOperation } from './local-operation.js';
import { workshopBrief } from './workshop-brief.js';
export { workshopBrief } from './workshop-brief.js';
export { claudeLocalFlags, claudeAbsolutePath } from './permission-task.js';
import { runLocalBuild } from './workshop-build.js';
export { runLocalBuild } from './workshop-build.js';
import type { Steer } from './live-agent.js';
import { type PermissionMode } from './agent-permissions.js';
import { type InteractiveRun } from './agy-interactive.js';
import type { ApiClient } from './api.js';
import { preflightAdapter, type AdapterSpec } from './adapters.js';
import { chooseAdapter, describeAdapters, detectLocalAdapters } from './workshop-adapters.js';
export { chooseAdapter, describeAdapters, detectLocalAdapters, pickAdapter } from './workshop-adapters.js';
import { syncWarning } from './workshop-sync.js';
export { syncWarning } from './workshop-sync.js';
import { formatWorkingCopy, inspectGame, localGameFiles, type TreeFile } from './checkout.js';
import { formatError } from './errors.js';
import { deliverySession } from './submit-session.js';
import { formatSubmitLines, submitGame } from './submit.js';
import { getStatus, isTerminalStatus } from './turn.js';
import { runLadder } from './verify.js';
import type { CliTelemetry } from './telemetry.js';
export type PickChoice = (choices: string[], question: string, signal?: AbortSignal) => Promise<string>;
import type { AdapterRun } from './headless-agent.js';
export type { AdapterRun } from './headless-agent.js';

type VerifyRun = NonNullable<Parameters<typeof runLadder>[0]['run']>;

export type Workshop = {
  slug: string;
  root: string;
  token: string;
  env: NodeJS.ProcessEnv;
  adapters: AdapterSpec[];
  selectedAgent?: string;
  failedTask?: {
    request: string;
    ack?: string;
    agent: string;
    before: TreeFile[];
    localOnly?: boolean;
    source?: 'play-brain';
  };
  onActivity?: (activity: string) => void;
  lastLog?: string;
  activityApi?: ApiClient;
  interactiveRun?: InteractiveRun;
  onLocalTask?: (agent: string) => void;
  onSteering?: (send: Steer | undefined) => void;
  onLocalPreview?: (url: string) => void;
  telemetry?: CliTelemetry;
  builder: string;
  pick: PickChoice;
  // Ctrl+C aborts the running child through this, not the REPL.
  abort: { current: AbortController | null };
  runAdapter?: AdapterRun;
  run?: VerifyRun;
  // One-shot verb: no picks, first agent, deliver or not.
  unattended?: { deliver: boolean };
  // Defaults to the process-wide mode (`--permissions`, /permissions).
  permissionMode?: PermissionMode;
};

export type HandoffOutcome = { builder: string; pending: boolean };

export const ADAPTER_TIMEOUT_MS = 30 * 60_000;

export async function openWorkshop(input: {
  api: ApiClient;
  token: string;
  slug: string;
  root: string;
  env: NodeJS.ProcessEnv;
  which?: (cmd: string) => string | null;
  write: (line: string) => void;
}): Promise<{ adapters: AdapterSpec[]; builder: string; status: string; activityApi: ApiClient }> {
  bindSourceProject(input.root, input.slug);
  const adapters = detectLocalAdapters(input.env, input.which);
  input.write(`◆ ${input.slug} — the checkout at ${input.root}`);
  try {
    const { sync, ignored } = await inspectGame({ api: input.api, slug: input.slug, dest: input.root });
    input.write(formatWorkingCopy({ sync, ignored }).join('\n'));
    const warning = syncWarning(sync, sourceProject(input.root) !== null);
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
  return { adapters, builder, status, activityApi: input.api };
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
    Partial<Pick<Workshop, 'env' | 'runAdapter' | 'root'>>;
  status: string;
  write: (line: string) => void;
}): Promise<string> {
  const { ws } = input;
  if (ws.root && readLocalOperation(ws.root)) return ws.builder;
  if (!ws.adapters.length || ws.builder === 'self' || isTerminalStatus(input.status)) return ws.builder;
  const local = ws.adapters.map((spec) => `${spec.name} here — its own credentials and billing`);
  for (const spec of ws.adapters) ws.telemetry?.record('delegate_offered', { adapter: spec.name });
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

export async function offerSubmit(input: {
  api: ApiClient;
  ws: Workshop;
  write: (line: string) => void;
}): Promise<void> {
  const { ws } = input;
  let session: Awaited<ReturnType<typeof deliverySession>>;
  try {
    session = await deliverySession(input.api, ws.slug);
  } catch (error) {
    input.write(formatError(error));
    return;
  }
  const takeover = Boolean(session?.locked && session.canTakeOver);
  if (session?.locked && (!takeover || ws.unattended)) {
    input.write(
      takeover
        ? 'Delivery blocked; use /submit --takeover to explicitly disconnect your agent.'
        : 'Delivery blocked; finish the platform agent or pending handoff in Studio, then retry.',
    );
    return;
  }
  if (takeover)
    input.write('Delivery uses the full local checkout. The previous server draft stays in the retired session.');
  const deliver = takeover ? 'disconnect the old agent and deliver this local checkout' : 'deliver a preview';
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
    const result = await submitGame({
      api: input.api,
      slug: ws.slug,
      dest: ws.root,
      run: ws.run,
      takeover,
      expectedSession: session ?? undefined,
      interactive: !ws.unattended,
    });
    if (result.kind === 'delivered') ws.telemetry?.record('delivered');
    input.write(formatSubmitLines(result, ws.slug).join('\n'));
  } catch (error) {
    input.write(formatError(error));
  }
}

// Unsynchronized repositories can edit locally; delivery still requires review.
export async function readyToEdit(input: {
  api: ApiClient;
  ws: Workshop;
  localOnly?: boolean;
  write: (line: string) => void;
}): Promise<boolean> {
  const { ws } = input;
  if (input.localOnly) return true;
  if (ws.builder !== 'self') {
    input.write(`builder is ${ws.builder} — /builder self takes the round here first`);
    return false;
  }
  try {
    const { sync } = await inspectGame({ api: input.api, slug: ws.slug, dest: ws.root });
    const sourceRepository = sourceProject(ws.root) !== null;
    const warning = syncWarning(sync, sourceRepository);
    if (warning) {
      input.write(`! ${warning}`);
      if (!(sourceRepository && sync.kind === 'legacy')) return false;
    }
    return true;
  } catch (error) {
    input.write(`cannot check the checkout against the platform — ${formatError(error)}`);
    return false;
  }
}

async function workshopTurnUnlocked(input: {
  api: ApiClient;
  ws: Workshop;
  request: string;
  ack?: string;
  agent?: string;
  retry?: boolean;
  localOnly?: boolean;
  offerDelivery?: boolean;
  write: (line: string) => void;
}): Promise<boolean> {
  if (!(await readyToEdit(input))) return false;
  const spec = await chooseAdapter(input.ws, input.agent);
  const before = input.retry ? input.ws.failedTask?.before : undefined;
  const task = {
    request: input.request,
    ack: input.ack,
    agent: spec.name,
    localOnly: input.localOnly,
    before: before ?? localGameFiles(input.ws.root, input.ws.slug),
  };
  let ok: boolean;
  try {
    ok = await runLocalBuild({
      ws: input.ws,
      spec,
      brief: workshopBrief(input.ws.slug, input.request, input.ack, input.ws.root),
      baseline: before,
      write: input.write,
    });
  } catch (error) {
    input.ws.failedTask = task;
    if (!input.ws.unattended)
      input.write(`Task saved locally — /retry resumes it with ${spec.name}; /diff shows partial edits.`);
    throw error;
  }
  if (!ok) {
    input.ws.failedTask = task;
    if (!input.ws.unattended)
      input.write(`Task saved locally — /retry resumes it with ${spec.name}; /diff shows partial edits.`);
    return false;
  }
  delete input.ws.failedTask;
  if (input.offerDelivery !== false) await offerSubmit(input);
  return ok;
}

export function workshopTurn(
  input: Parameters<typeof workshopTurnUnlocked>[0],
): ReturnType<typeof workshopTurnUnlocked> {
  return withCheckoutWriter(input.ws.root, () => workshopTurnUnlocked(input));
}
