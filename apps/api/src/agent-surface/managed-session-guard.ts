// Managed sessions: end waits for submit and never closes undelivered silently.
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { effectiveSubmitMode } from './mcp-source-submit-tools.js';
import {
  channelControlFields,
  pendingMessagesFromChannel,
  toolOk,
  type ChannelControlBody,
  type ToolContext,
  type ToolResult,
} from './mcp-tool-support.js';

type Live = () => Promise<{ statusCode: number; json: () => unknown }>;

export interface ManagedSessionGuardDeps {
  store: Pick<Store, 'stepManagedSession'> & Partial<Pick<Store, 'getCreatorNotes'>>;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
  waitMs?: number;
}

export interface ManagedCall {
  jobId: number;
  roundGeneration: number;
  sessionId: string;
  ownerUid?: string;
  // A builder handoff still waits for end to acknowledge it.
  handoffPending: boolean;
  mode: 'preview' | 'publish';
  live: Live;
  run: () => Promise<ToolResult>;
}

const END_WAIT_MS = 30_000;
const POLL_MS = 1_000;

export const SESSION_ENDED_RETRY =
  'Not delivered: this session already called end, so it delivers nothing more. A new round starts a new session.';
export const SUBMIT_RUNNING_REASON =
  'Not ended: a submit_sources from this session is still running. Its reply says whether it delivered.';
export const NOTHING_DELIVERED_REASON =
  'Not ended: nothing this session submitted was delivered; the last submit_sources was refused (its reply ' +
  'says why). This applies to the first end only; a second end closes the session.';

export const NOTES_UNSAVED_WARNING = {
  code: 'notes_unsaved',
  message:
    'Delivered, but creator_notes has not been written this round. Before end, call creator_notes with notes ' +
    'and the revision you read, for the next builder.',
};

// After a delivery, steer to the notes; a failed read stays silent.
async function withNotesReminder(
  deps: ManagedSessionGuardDeps,
  call: ManagedCall,
  result: ToolResult,
): Promise<ToolResult> {
  if (!call.ownerUid || !deps.store.getCreatorNotes) return result;
  const notes = await deps.store.getCreatorNotes(call.ownerUid).catch(() => undefined);
  if (notes === undefined) return result;
  if (notes?.jobId === call.jobId && notes.roundGeneration === call.roundGeneration) return result;
  const data = result.structuredContent as Record<string, unknown>;
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  return toolOk({
    ...data,
    warnings: [...warnings, NOTES_UNSAVED_WARNING],
  });
}

async function liveFields(live: Live): Promise<Record<string, unknown>> {
  const res = await live().catch(() => null);
  const body = (res?.statusCode === 200 ? res.json() : {}) as ChannelControlBody & {
    pending?: Array<{ id: string; text: string; createdAt: string }>;
  };
  return { ...channelControlFields(body), pendingMessages: pendingMessagesFromChannel(body) };
}

function at(deps: ManagedSessionGuardDeps): string {
  return new Date(deps.now()).toISOString();
}

export async function guardManagedSubmit(deps: ManagedSessionGuardDeps, call: ManagedCall): Promise<ToolResult> {
  const step = (event: 'submit' | 'delivered' | 'refused') =>
    deps.store.stepManagedSession(call.jobId, call.roundGeneration, call.sessionId, event, at(deps));
  if ((await step('submit')) === 'ended') {
    return toolOk({
      ok: false,
      mode: call.mode,
      rejected: 'session_ended',
      retry: SESSION_ENDED_RETRY,
      deliveryId: null,
      delivery: null,
      gateStarted: false,
      deliveriesRemaining: null,
      ...(await liveFields(call.live)),
    });
  }
  try {
    const result = await call.run();
    const ok = (result.structuredContent as { ok?: unknown } | undefined)?.ok === true;
    await step(ok ? 'delivered' : 'refused');
    return ok ? await withNotesReminder(deps, call, result) : result;
  } catch (error) {
    await step('refused').catch(() => undefined);
    throw error;
  }
}

// A refused end leaves the session open, so it may still submit.
async function runEnd(deps: ManagedSessionGuardDeps, call: ManagedCall): Promise<ToolResult> {
  const settle = (event: 'ended' | 'reopen') =>
    deps.store.stepManagedSession(call.jobId, call.roundGeneration, call.sessionId, event, at(deps));
  try {
    const result = await call.run();
    await settle(result.isError === true ? 'reopen' : 'ended');
    return result;
  } catch (error) {
    await settle('reopen').catch(() => undefined);
    throw error;
  }
}

export async function guardManagedEnd(deps: ManagedSessionGuardDeps, call: ManagedCall): Promise<ToolResult> {
  if (call.handoffPending) return call.run();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = deps.now() + (deps.waitMs ?? END_WAIT_MS);
  let outcome = await deps.store.stepManagedSession(call.jobId, call.roundGeneration, call.sessionId, 'end', at(deps));
  while (outcome === 'wait' && deps.now() < deadline) {
    await sleep(POLL_MS);
    outcome = await deps.store.stepManagedSession(call.jobId, call.roundGeneration, call.sessionId, 'end', at(deps));
  }
  if (outcome === 'pass') return call.run();
  if (outcome === 'ok') return runEnd(deps, call);
  const running = outcome === 'wait';
  return toolOk({
    ok: false,
    ended: false,
    rejected: running ? 'submit_running' : 'nothing_delivered',
    reason: running ? SUBMIT_RUNNING_REASON : NOTHING_DELIVERED_REASON,
    ...(await liveFields(call.live)),
  });
}

interface AuthedForGuard {
  jobId: number;
  claims: { roundGeneration?: number };
  record: SubmissionRecord;
  channelToken: string;
}

export interface ManagedCallRunnerDeps extends ManagedSessionGuardDeps {
  // Signed session id under a managed opener; null for public clients.
  managedSessionId: (ctx: ToolContext, args: Record<string, unknown>) => string | null;
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<AuthedForGuard | ToolResult>;
  injectChannel: (
    request: ToolContext['request'],
    method: 'GET',
    path: string,
    channelToken: string,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
  gamesStore?: GamesStore;
}

// Runs a tool call; guards submit_sources and end in managed sessions.
export function createManagedCallRunner(deps: ManagedCallRunnerDeps) {
  return async (
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
    run: () => Promise<ToolResult>,
  ): Promise<ToolResult> => {
    if (name !== 'submit_sources' && name !== 'end') return run();
    const sessionId = deps.managedSessionId(ctx, args);
    if (!sessionId) return run();
    const auth = await deps.resolveAuth(ctx, args);
    if (!('channelToken' in auth)) return run();
    const requested = args.mode === 'preview' || args.mode === 'publish' ? args.mode : undefined;
    const call: ManagedCall = {
      jobId: auth.jobId,
      roundGeneration: auth.claims.roundGeneration ?? 1,
      sessionId,
      ownerUid: auth.record.ownerUid,
      handoffPending: auth.record.builderHandoff?.awaitsAgentAck === true && !auth.record.builderHandoff.acknowledgedAt,
      mode: await effectiveSubmitMode(requested, args.fromLatestDelivery === true, auth.record, deps.gamesStore),
      live: () => deps.injectChannel(ctx.request, 'GET', AGENT_CHANNEL_ROUTES.INBOX, auth.channelToken),
      run,
    };
    return name === 'end' ? guardManagedEnd(deps, call) : guardManagedSubmit(deps, call);
  };
}
