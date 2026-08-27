import { detectStall } from './job-state.js';
import {
  VertexStudioChatAgent,
  type ChatAgentImage,
  type ChatAgentScope,
  type ChatAgentStatus,
  type StudioChatAgent,
} from './chat-agent.js';
import { MAX_CHAT_TURNS, rememberChatTurn, type ChatTurn } from './chat-turns.js';
import { isMcpPresenceEventText } from '../agent-surface/mcp-presence.js';
import { stripPlaytestContext } from '../delivery/build-transcript.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { asChatAgentLogger, logChatAgentDecision, logChatAgentFailOpen } from '../telemetry/chat-agent-metrics.js';
import { normalizeAtIntake, type IntakeText } from '../platform/localize-intake.js';
import { MAX_REVISION_CHARS } from '../platform/submission-status.js';
import { createTranslatorFromEnv, type Translator } from '../platform/translate.js';
import type { ChatGate } from './creation-limits.js';
import type { BuilderKind } from '@gamedevpl/contract';
import type { CreatorMessageOrigin, Store, SubmissionRecord } from '../platform/store.js';

export type ChatOrchestrationOutcome = { kind: 'build'; ackText?: string } | { kind: 'replied'; replyText: string };

export interface ChatOrchestrationOptions {
  store?: Store;
  now: () => number;
  log: { info?: (context: object, message: string) => void; warn?: (context: object, message: string) => void };
  chatAgent?: StudioChatAgent;
  chatGate?: ChatGate | null;
  dailyChatQuota: number;
  translator?: Translator;
}

export interface ChatOrchestration {
  runChatAgent(input: {
    jobId: number;
    // The clean creator sentence, never the fenced playtest context block.
    message: string;
    scope: ChatAgentScope;
    record: SubmissionRecord;
    locale: string;
    ip: string;
    uid: string;
    // Reference images the creator attached to this turn, already validated PNGs.
    images?: ChatAgentImage[];
  }): Promise<ChatOrchestrationOutcome | null>;
  // Localizes a relayed request, or passes it through — only 'agent' translates.
  relayedMessageLocalization(origin: CreatorMessageOrigin | undefined, text: string): Promise<IntakeText>;
}

function builderOf(record: SubmissionRecord | null | undefined): BuilderKind {
  return record?.builder ?? record?.defaultBuilder ?? 'platform';
}

// Runs the mini chat agent that fields feedback/improve turns before dispatch.
export function createChatOrchestration(options: ChatOrchestrationOptions): ChatOrchestration {
  const { store, now, chatGate, dailyChatQuota } = options;
  const chatAgent = options.chatAgent ?? new VertexStudioChatAgent();
  const chatAgentLog = asChatAgentLogger(options.log);
  // Only these two writes may call this — see git history for why.
  const translator: Translator = options.translator ?? createTranslatorFromEnv();

  // Per-IP burst limit, independent of the per-user daily quota below.
  const chatTurnsByIp = new Map<string, number[]>();
  const chatTurnRateLimitWindowMs = 60_000;
  const maxChatTurnsPerWindow = 20;

  // Facts the mini chat agent may speak from.
  async function buildChatAgentStatus(record: SubmissionRecord, scope: ChatAgentScope): Promise<ChatAgentStatus> {
    const state = record.state ?? 'queued';
    // A fresh improvement job has no round to classify a stall for.
    const stall =
      scope === 'draft'
        ? detectStall({
            state,
            stateSince: record.stateSince ?? record.createdAt,
            lastAgentSignalAt: record.lastAgentSignalAt,
            agentState: record.agentState,
            agentEndedAt: record.agentEndedAt,
            now: now(),
            builder: builderOf(record),
          })
        : null;
    const [pending, events] = store
      ? await Promise.all([
          store.listPendingCreatorMessages(record.jobId, { limit: 20 }),
          store.listBuildEvents(record.jobId, { limit: 3 }),
        ])
      : [[], []];
    return {
      scope,
      state,
      ...(stall ? { stall } : {}),
      hasDelivered: Boolean(record.deliveredVersion),
      ...(scope === 'improve' ? { isPublished: Boolean(record.publishedAt) } : {}),
      pendingCount: pending.length,
      // listBuildEvents is newest-first; describeStatus labels these oldest-first.
      recentEvents: events
        .filter((event) => !isMcpPresenceEventText(event.text, event.createdAt))
        .map((event) => event.text)
        .reverse(),
      minutesSinceLastSignal: record.lastAgentSignalAt
        ? Math.max(0, Math.round((now() - Date.parse(record.lastAgentSignalAt)) / 60_000))
        : null,
    };
  }

  // Recent turns for the chat agent's history, oldest first.
  async function recentChatTurns(jobId: number): Promise<ChatTurn[]> {
    if (!store) return [];
    const raw = await store.listCreatorMessages(jobId, { limit: MAX_CHAT_TURNS * 3 });
    let turns: ChatTurn[] = [];
    let pending: string | null = null;
    for (const message of raw) {
      if (message.origin === 'studio') {
        if (pending !== null) {
          turns = rememberChatTurn(turns, { message: pending, reply: message.text });
          pending = null;
        }
        continue;
      }
      if (message.origin === 'studio_ack') {
        if (pending !== null) {
          turns = rememberChatTurn(turns, { message: pending, built: true, ackText: message.text });
          pending = null;
        }
        continue;
      }
      // Unpaired: sent to the builder either way, ack or not.
      if (pending !== null) turns = rememberChatTurn(turns, { message: pending, built: true });
      pending = stripPlaytestContext(message.text);
    }
    if (pending !== null) turns = rememberChatTurn(turns, { message: pending, built: true });
    return turns;
  }

  async function runChatAgent(input: {
    jobId: number;
    message: string;
    scope: ChatAgentScope;
    record: SubmissionRecord;
    locale: string;
    ip: string;
    uid: string;
    images?: ChatAgentImage[];
  }): Promise<ChatOrchestrationOutcome | null> {
    if (!store || !chatAgentLog) return null;
    if (isRateLimited(chatTurnsByIp, input.ip, now(), maxChatTurnsPerWindow, chatTurnRateLimitWindowMs)) {
      return null;
    }
    // The gate/quota reads sit inside this same fail-open boundary too.
    try {
      const dateStr = new Date(now()).toISOString().slice(0, 10);
      if (chatGate) {
        const gate = await chatGate.checkAndSpend(input.uid, dateStr);
        if (!gate.allowed) {
          logChatAgentFailOpen(chatAgentLog, {
            jobId: input.jobId,
            scope: input.scope,
            reason: gate.reason,
          });
          return null;
        }
      }
      const quota = await store.checkAndIncrementQuota(input.uid, dateStr, dailyChatQuota, 'chats');
      if (!quota.allowed) {
        logChatAgentFailOpen(chatAgentLog, {
          jobId: input.jobId,
          scope: input.scope,
          reason: 'daily_quota',
        });
        return null;
      }
      const [status, history] = await Promise.all([
        buildChatAgentStatus(input.record, input.scope),
        recentChatTurns(input.jobId),
      ]);
      const decision = await chatAgent.decide({
        message: input.message,
        status,
        history,
        locale: input.locale,
        ...(input.record.title || input.record.spec
          ? { game: { title: input.record.title, concept: input.record.spec } }
          : {}),
        ...(input.images?.length ? { images: input.images } : {}),
      });
      logChatAgentDecision(chatAgentLog, {
        jobId: input.jobId,
        scope: input.scope,
        outcome: decision.kind,
      });
      if (decision.tokens) {
        await store
          .recordJobCost(input.jobId, {
            kind: 'chat',
            at: new Date(now()).toISOString(),
            by: decision.model ?? 'vertex',
            tokens: decision.tokens,
          })
          .catch(() => {});
      }
      return decision.kind === 'build'
        ? { kind: 'build', ...(decision.text ? { ackText: decision.text } : {}) }
        : { kind: 'replied', replyText: decision.text };
    } catch (error) {
      logChatAgentFailOpen(chatAgentLog, {
        jobId: input.jobId,
        scope: input.scope,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async function relayedMessageLocalization(
    origin: CreatorMessageOrigin | undefined,
    text: string,
  ): Promise<IntakeText> {
    // A creator's own words are stored exactly as typed, never rewritten.
    if (origin !== 'agent') return { text };
    // kind 'message', never 'log' — a summary drops the creator's own details.
    return normalizeAtIntake(translator, text, { kind: 'message', maxLength: MAX_REVISION_CHARS });
  }

  return { runChatAgent, relayedMessageLocalization };
}
