import { isCliAction } from '@gamedevpl/contract';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { checkUserAccess } from '../platform/auth.js';
import { cliSurfaceEnabled } from '../platform/cli-surface.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';
import type { ContentChecker } from '../platform/moderation.js';
import { peekQuota } from '../platform/quota-peek.js';
import type { Store } from '../platform/store.js';
import { mintToken, verifyToken } from '../platform/submission-token.js';
import { MAX_REVISION_CHARS } from '../platform/submission-status.js';
import { clipCliChatTurns, type CliChatRecord, type CliChatTurn } from '../store/slices/cli-chat.js';
import { CREATION_REFUSAL_CODES, type ChatGate } from './creation-limits.js';
import type { CreateGameResult } from './create-game.js';
import { collapseJobsToOwnerGames, MAX_OWNER_GAMES } from './owner-games.js';
import { failClosedReply, IntakeChatAgent, type IntakeAgent } from './intake-agent.js';

const ChatBodySchema = z.object({
  text: z.string().trim().min(1, 'text is required').max(MAX_REVISION_CHARS, 'text is too long'),
  conversationId: z.string().uuid().optional(),
  prepareOnly: z.boolean().optional(),
  session: z
    .object({
      token: z.string().min(1).max(512).optional(),
      checkoutSlug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100)
        .optional(),
      agents: z
        .array(
          z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(40),
        )
        .max(20),
    })
    .strict()
    .optional(),
});

export interface CliChatRoutesOptions {
  store: Store | undefined;
  contentChecker: ContentChecker;
  submissionTokenSecret: string | undefined;
  createGame: (input: {
    uid: string;
    ip: string;
    payload: unknown;
    acceptLanguage?: string;
    openedBy?: 'creator' | 'agent';
    log: { error: (context: object, message: string) => void; info?: (context: object, message: string) => void };
  }) => Promise<CreateGameResult>;
  intakeAgent?: IntakeAgent;
  chatGate?: ChatGate | null;
  dailyChatQuota: number;
  now: () => number;
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({ error: 'not found' });
}

function canned(message: string, conversationId: string) {
  return { kind: 'reply' as const, text: failClosedReply(message), conversationId };
}

function gameState(tip: { publishedAt?: string; state?: string }): string {
  if (tip.publishedAt) return 'published';
  return tip.state ?? 'draft';
}

export function registerCliChatRoutes(app: FastifyInstance, options: CliChatRoutesOptions): void {
  const { store, contentChecker, submissionTokenSecret, createGame, chatGate, dailyChatQuota, now } = options;
  const intakeAgent = options.intakeAgent ?? new IntakeChatAgent();
  const chatsByIp = new Map<string, number[]>();
  const windowMs = 60_000;
  const maxPerWindow = 20;

  app.post(
    '/api/cli/chat',
    { config: { rateLimit: { max: maxPerWindow, timeWindow: windowMs } } },
    async (request, reply) => {
      if (!cliSurfaceEnabled()) return notFound(reply);
      if (!checkUserAccess(request, reply)) return;
      if (!store) return reply.status(503).send({ error: 'chat is unavailable' });

      const parsed = ChatBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const uid = request.user!.uid;
      const text = parsed.data.text;
      let session: import('./intake-agent.js').IntakeAgentRequest['session'];
      if (parsed.data.session) {
        const supplied = parsed.data.session;
        session = { checkout: false, agents: supplied.agents };
        if (supplied.token) {
          if (!submissionTokenSecret) return reply.status(503).send({ error: 'submissions are not configured' });
          let jobId;
          try {
            jobId = verifyToken(supplied.token, submissionTokenSecret);
          } catch {
            return reply.status(403).send({ error: 'invalid active game' });
          }
          const record = await store.getSubmission(jobId);
          if (!record || record.ownerUid !== uid) return reply.status(403).send({ error: 'invalid active game' });
          if (supplied.checkoutSlug && supplied.checkoutSlug !== record.slug) {
            return reply.status(400).send({ error: 'checkout does not match active game' });
          }
          session = {
            ...session,
            slug: record.slug,
            state: gameState(record),
            builder: record.builder,
            checkout: Boolean(supplied.checkoutSlug),
          };
        } else if (supplied.checkoutSlug) {
          return reply.status(400).send({ error: 'checkout requires an active game token' });
        }
      }
      const currentTime = now();
      const dateStr = new Date(currentTime).toISOString().slice(0, 10);

      if (isRateLimited(chatsByIp, request.clientIp, currentTime, maxPerWindow, windowMs)) {
        return reply.status(429).send({ error: 'too many chat turns, please try again later' });
      }

      const headroom = await peekQuota(store, uid, dateStr, dailyChatQuota, 'chats');
      if (!headroom.allowed) {
        if (headroom.tier === 'blocked') return reply.status(403).send({ error: 'account is blocked' });
        return reply.status(429).send({ error: 'daily chat quota exceeded' });
      }

      const moderation = await contentChecker.checkFields([text]);
      if (!moderation.allowed) {
        logModerationRejection(request.log, { surface: 'cli_chat', uid, category: moderation.category });
        return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
      }

      if (chatGate) {
        const gate = await chatGate.checkAndSpend(uid, dateStr);
        if (!gate.allowed) {
          return reply.status(429).send({ error: CREATION_REFUSAL_CODES[gate.reason] });
        }
      }

      const quota = await store.checkAndIncrementQuota(uid, dateStr, dailyChatQuota, 'chats');
      if (!quota.allowed) {
        if (quota.tier === 'blocked') return reply.status(403).send({ error: 'account is blocked' });
        return reply.status(429).send({ error: 'daily chat quota exceeded' });
      }

      const existing = await loadConversation(store, uid, parsed.data.conversationId);
      const conversationId = existing?.conversationId ?? randomUUID();
      const history = existing?.turns ?? [];

      // Without this the agent guessed the shelf and wrongly said none.
      let games;
      let gamesTotal;
      try {
        const records = await store.listSubmissionsByOwner(uid);
        const shelf = collapseJobsToOwnerGames(records, 'shelf');
        gamesTotal = shelf.length;
        games = shelf
          .slice(0, MAX_OWNER_GAMES)
          .flatMap((game) => (game.tip.slug ? [{ slug: game.tip.slug, state: gameState(game.tip) }] : []));
      } catch (error) {
        request.log.warn({ err: error, cliChat: { outcome: 'shelf_unread' } }, 'cli intake chat shelf unreadable');
      }

      let decision;
      try {
        decision = await intakeAgent.decide({ message: text, history, games, gamesTotal, session });
      } catch (error) {
        request.log.warn({ err: error, cliChat: { outcome: 'fail_closed' } }, 'cli intake chat failed closed');
        const fallback = canned(text, conversationId);
        await saveTurns(store, uid, conversationId, history, text, fallback.text, now);
        return reply.send(fallback);
      }

      if (decision.kind === 'action') {
        const action = decision.action;
        if (
          !session ||
          !isCliAction(action) ||
          (action.name !== 'play' && !session.slug) ||
          (action.name === 'play' && action.slug !== session.slug && !games?.some((game) => game.slug === action.slug))
        ) {
          const fallback = canned(text, conversationId);
          await saveTurns(store, uid, conversationId, history, text, fallback.text, now);
          return reply.send(fallback);
        }
        request.log.info({ cliChat: { outcome: 'action', action: action.name } }, 'cli assistant');
        await saveTurns(
          store,
          uid,
          conversationId,
          history,
          text,
          `Requested CLI action: ${action.name}${action.name === 'edit' ? ': ' + action.request : ''}`,
          now,
        );
        return reply.send({ kind: 'action', action, conversationId });
      }

      if (decision.kind === 'reply') {
        request.log.info({ cliChat: { outcome: 'reply' } }, 'cli intake chat');
        await saveTurns(store, uid, conversationId, history, text, decision.text, now);
        return reply.send({ kind: 'reply', text: decision.text, conversationId });
      }

      if (parsed.data.prepareOnly) {
        await saveTurns(store, uid, conversationId, history, text, decision.ack ?? decision.title, now);
        return reply.send({
          kind: 'proposal',
          title: decision.title,
          concept: decision.concept,
          ack: decision.ack,
          conversationId,
        });
      }

      const created = await createGame({
        uid,
        ip: request.clientIp,
        payload: { title: decision.title, concept: decision.concept },
        acceptLanguage: request.headers['accept-language'],
        openedBy: 'creator',
        log: request.log,
      });
      if (!created.ok) {
        request.log.info({ cliChat: { outcome: 'create_refused', status: created.status } }, 'cli intake chat');
        if (created.error === 'content_rejected') {
          return reply.status(created.status).send({ error: created.error, category: created.category ?? 'other' });
        }
        if (created.status === 429 || created.status === 403 || created.status === 503) {
          return reply.status(created.status).send({ error: created.error });
        }
        const fallback = canned(text, conversationId);
        await saveTurns(store, uid, conversationId, history, text, fallback.text, now);
        return reply.send(fallback);
      }

      if (!submissionTokenSecret) {
        return reply.status(503).send({ error: 'submissions are not configured' });
      }
      const token = mintToken(created.jobId, submissionTokenSecret);
      request.log.info({ cliChat: { outcome: 'create' }, slug: created.slug }, 'cli intake chat');
      const nextConversationId = randomUUID();
      await store.putCliChat(uid, {
        conversationId: nextConversationId,
        turns: [],
        updatedAt: new Date(now()).toISOString(),
      });
      return reply.send({
        kind: 'create',
        token,
        slug: created.slug,
        conversationId: nextConversationId,
        ...(decision.ack ? { ack: decision.ack } : {}),
      });
    },
  );
}

async function loadConversation(
  store: Store,
  uid: string,
  conversationId: string | undefined,
): Promise<CliChatRecord | null> {
  const record = await store.getCliChat(uid);
  if (!record) return null;
  if (conversationId && record.conversationId !== conversationId) return null;
  return record;
}

async function saveTurns(
  store: Store,
  uid: string,
  conversationId: string,
  history: CliChatTurn[],
  userText: string,
  assistantText: string,
  now: () => number,
): Promise<void> {
  await store.putCliChat(uid, {
    conversationId,
    updatedAt: new Date(now()).toISOString(),
    turns: clipCliChatTurns([...history, { role: 'user', text: userText }, { role: 'assistant', text: assistantText }]),
  });
}
