import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  clientHasExtension,
  isModernRejection,
  isModernRequest,
  MISSING_CLIENT_CAPABILITY,
  MODERN_PROTOCOL_VERSIONS,
  modernErrorStatus,
  modernResult,
  readModernRequest,
  SKILLS_EXTENSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  TASKS_EXTENSION,
  type CachePolicy,
  type ModernRequest,
} from './mcp-modern-protocol.js';
import { findSkill, serverSkills, SKILL_CACHE, skillEntry } from './mcp-skills.js';
import {
  completedGateResult,
  GATE_TASK_TTL_MS,
  GATE_TASK_WORKING_MESSAGE,
  gateTaskDelivery,
  mintGateTaskId,
  readGateTaskId,
  taskFields,
  verdictPending,
} from './mcp-gate-task.js';
import type { ToolContext, ToolHandler, ToolResult } from './mcp-tool-support.js';
import { MCP_INSTRUCTIONS } from './mcp-round-guide.js';
import { verifyManagedMcpOpener } from '../platform/agent-token.js';

export const SERVER_INFO = { name: 'gamedevpl', version: '1.0.0' };
// tools/list depends on the bearer, so it is private.
const TOOLS_LIST_CACHE: CachePolicy = { ttlMs: 300_000, cacheScope: 'private' };
const STATIC_CACHE: CachePolicy = { ttlMs: 3_600_000, cacheScope: 'public' };

type Id = string | number | null | undefined;

interface Message {
  id?: Id;
  method?: string;
  params?: unknown;
}

type Nudge = (tool: string, args: Record<string, unknown>, ctx: ToolContext, result: ToolResult) => Promise<ToolResult>;
type Warning = { code: string; message: string };

export interface ModernSurfaceDeps {
  agentTokenSecret: string | undefined;
  now: () => number;
  tools: Record<string, { handler: ToolHandler }>;
  applySessionNudges: Nudge;
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<{ channelToken: string } | ToolResult>;
  writePiggyback: (
    request: FastifyRequest,
    channelToken: string,
  ) => Promise<{ pendingMessages: unknown[]; warnings?: Warning[] }>;
}

const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: '2.0' as const, id: id ?? null, result });
const rpcError = (id: Id, code: number, message: string, data?: unknown) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

// MCP 2026-07-28 methods: discovery, skills and tasks, plus reply shaping.
export function createModernSurface(surface: ModernSurfaceDeps) {
  const { now, tools } = surface;
  const deps = { secret: surface.agentTokenSecret ?? '', now, gateVerdict: () => tools.get_gate_verdict!.handler };

  // Modern fields (or null for legacy), or the reply already sent.
  async function route(request: FastifyRequest, reply: FastifyReply, message: Message, bearerToken: string | null) {
    if (!isModernRequest(message)) return { modern: null, sent: null };
    const parsed = readModernRequest(message, request.headers, SUPPORTED_PROTOCOL_VERSIONS);
    if (isModernRejection(parsed)) {
      const body = rpcError(message.id, parsed.code, parsed.message, parsed.data);
      return { modern: null, sent: reply.status(parsed.status).send(body) };
    }
    const modern = { ...parsed, managed: isManaged(bearerToken) };
    return { modern, sent: await handle(request, reply, message, modern, bearerToken) };
  }

  // Managed builders follow their own prompt: no skills, no gate tasks.
  function isManaged(bearerToken: string | null): boolean {
    if (!bearerToken || !deps.secret) return false;
    try {
      verifyManagedMcpOpener(bearerToken, deps.secret);
      return true;
    } catch {
      return false;
    }
  }

  // Reply helpers that shape results for whichever revision the request spoke.
  function replier(reply: FastifyReply, message: Message, modern: ModernRequest | null) {
    const cache = message.method === 'tools/list' ? TOOLS_LIST_CACHE : undefined;
    return {
      ok: (result: object) => send(reply, message.id, modern, result, cache),
      fail: (code: number, text: string) => fail(reply, message.id, modern, code, text),
    };
  }

  function send(reply: FastifyReply, id: Id, modern: ModernRequest | null, result: object, cache?: CachePolicy) {
    const body = modern ? modernResult(result as Record<string, unknown>, SERVER_INFO, cache) : result;
    return reply.send(rpcResult(id, body));
  }

  function fail(reply: FastifyReply, id: Id, modern: ModernRequest | null, code: number, text: string, data?: unknown) {
    return (modern ? reply.status(modernErrorStatus(code)) : reply).send(rpcError(id, code, text, data));
  }

  // A delivered submit_sources becomes a gate task for a task-capable client.
  function gateTask(modern: ModernRequest | null, tool: string, sessionKey: string, result: ToolResult) {
    if (!modern || modern.managed || tool !== 'submit_sources' || !sessionKey) return null;
    if (!clientHasExtension(modern, TASKS_EXTENSION)) return null;
    const delivery = gateTaskDelivery(result);
    if (!delivery) return null;
    const createdAt = deps.now();
    const claims = { ...delivery, sessionKey, createdAt, expiresAt: createdAt + GATE_TASK_TTL_MS };
    const taskId = mintGateTaskId(deps.secret, claims);
    return { resultType: 'task', ...taskFields(taskId, claims, 'working', GATE_TASK_WORKING_MESSAGE, createdAt) };
  }

  async function taskMethod(
    request: FastifyRequest,
    reply: FastifyReply,
    message: Message,
    modern: ModernRequest,
    bearerToken: string | null,
  ) {
    const ok = (result: object) => send(reply, message.id, modern, result);
    const refuse = (code: number, text: string, data?: unknown) => fail(reply, message.id, modern, code, text, data);
    if (!clientHasExtension(modern, TASKS_EXTENSION)) {
      return refuse(MISSING_CLIENT_CAPABILITY, 'Missing required client capability', {
        requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
      });
    }
    const params = (message.params ?? {}) as { taskId?: unknown };
    const taskId = typeof params.taskId === 'string' ? params.taskId : '';
    const nowMs = deps.now();
    const claims = readGateTaskId(deps.secret, taskId, nowMs);
    if (!claims) return refuse(-32602, 'unknown or expired taskId');
    // No input requests; cancelling does not stop Cloud Build.
    if (message.method === 'tasks/update') return refuse(-32602, 'this task has no outstanding input requests');
    if (message.method === 'tasks/cancel') return ok({});
    const ctx: ToolContext = { request, sessionId: null, bearerToken };
    const args = { sessionKey: claims.sessionKey, deliveryId: claims.deliveryId };
    const verdict = await deps.gateVerdict()(args, ctx);
    if (verdictPending(verdict)) return ok(taskFields(taskId, claims, 'working', GATE_TASK_WORKING_MESSAGE, nowMs));
    // A revoked session ends the task with its refusal.
    if (verdict.isError) {
      return ok({
        ...taskFields(taskId, claims, 'completed', 'The gate verdict could not be read.', nowMs),
        result: { resultType: 'complete', ...verdict },
      });
    }
    // The same nudges as get_gate_verdict, so a refused gate carries must_fix_gate.
    const nudged = await surface.applySessionNudges('get_gate_verdict', args, ctx, verdict);
    const result = await withInbox(completedGateResult(claims, nudged), ctx, args);
    return ok({
      ...taskFields(taskId, claims, 'completed', 'The gate verdict is in.', nowMs),
      result: { resultType: 'complete', ...result },
    });
  }

  // Creator notes pending now, as the submit reply would have carried them.
  async function withInbox(result: ToolResult, ctx: ToolContext, args: Record<string, unknown>) {
    const auth = await surface.resolveAuth(ctx, args);
    if (!('channelToken' in auth)) return result;
    const piggy = await surface.writePiggyback(ctx.request, auth.channelToken);
    const data = result.structuredContent as Record<string, unknown>;
    const prior = Array.isArray(data.warnings) ? (data.warnings as Warning[]) : [];
    const added = (piggy.warnings ?? []).filter((w) => !prior.some((p) => p.code === w.code));
    const merged = {
      ...data,
      pendingMessages: piggy.pendingMessages,
      ...(prior.length + added.length > 0 ? { warnings: [...prior, ...added] } : {}),
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(merged) }], structuredContent: merged };
  }

  // Modern-only methods; null for methods both revisions share.
  async function handle(
    request: FastifyRequest,
    reply: FastifyReply,
    message: Message,
    modern: ModernRequest,
    bearerToken: string | null,
  ): Promise<FastifyReply | null> {
    const params = (message.params ?? {}) as { uri?: unknown };
    const uri = typeof params.uri === 'string' ? params.uri : '';
    const ok = (result: object, cache?: CachePolicy) => send(reply, message.id, modern, result, cache);
    const hasSkills = !modern.managed && serverSkills().length > 0;
    switch (message.method) {
      case 'server/discover':
        return ok(
          {
            supportedVersions: [...MODERN_PROTOCOL_VERSIONS],
            capabilities: {
              tools: {},
              ...(hasSkills ? { resources: {} } : {}),
              extensions: {
                ...(hasSkills ? { [SKILLS_EXTENSION]: {} } : {}),
                ...(modern.managed ? {} : { [TASKS_EXTENSION]: {} }),
              },
            },
            instructions: MCP_INSTRUCTIONS,
          },
          STATIC_CACHE,
        );
      case 'skills/list':
        return hasSkills ? ok({ skills: serverSkills().map(skillEntry) }, SKILL_CACHE) : null;
      case 'skills/get': {
        if (!hasSkills) return null;
        const skill = findSkill(uri);
        if (!skill) return fail(reply, message.id, modern, -32602, `unknown skill: ${uri || '(missing uri)'}`);
        return ok({ skill: skillEntry(skill) }, SKILL_CACHE);
      }
      // Skill files are reached through skills/list, not offered as context.
      case 'resources/list':
        return ok({ resources: [] }, STATIC_CACHE);
      case 'resources/templates/list':
        return ok({ resourceTemplates: [] }, STATIC_CACHE);
      case 'resources/read': {
        const skill = modern.managed ? null : findSkill(uri);
        if (!skill) return fail(reply, message.id, modern, -32602, `unknown resource: ${uri || '(missing uri)'}`);
        return ok({ contents: [{ uri: skill.uri, mimeType: 'text/markdown', text: skill.text }] }, SKILL_CACHE);
      }
      case 'tasks/get':
      case 'tasks/update':
      case 'tasks/cancel':
        return modern.managed ? null : taskMethod(request, reply, message, modern, bearerToken);
      default:
        return null;
    }
  }

  return { route, replier, gateTask };
}
