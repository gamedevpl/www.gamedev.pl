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

const rpcResult = (id: Id, result: unknown) => ({ jsonrpc: '2.0' as const, id: id ?? null, result });
const rpcError = (id: Id, code: number, message: string, data?: unknown) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

// MCP 2026-07-28 methods: discovery, skills and tasks, plus reply shaping.
export function createModernSurface(
  secret: string | undefined,
  now: () => number,
  tools: Record<string, { handler: ToolHandler }>,
  nudge: Nudge,
  legacyVersions: Iterable<string>,
) {
  const deps = { secret: secret ?? '', now, nudge, gateVerdict: () => tools.get_gate_verdict!.handler };

  // Modern fields (or null for legacy), or the reply already sent.
  async function route(request: FastifyRequest, reply: FastifyReply, message: Message, bearerToken: string | null) {
    if (!isModernRequest(message)) return { modern: null, sent: null };
    const parsed = readModernRequest(message, request.headers, legacyVersions);
    if (isModernRejection(parsed)) {
      const body = rpcError(message.id, parsed.code, parsed.message, parsed.data);
      return { modern: null, sent: reply.status(parsed.status).send(body) };
    }
    return { modern: parsed, sent: await handle(request, reply, message, parsed, bearerToken) };
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
    if (!modern || tool !== 'submit_sources' || !sessionKey) return null;
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
    // The same nudges as get_gate_verdict, so a refused gate carries must_fix_gate.
    const result = completedGateResult(claims, await deps.nudge('get_gate_verdict', args, ctx, verdict));
    return ok({ ...taskFields(taskId, claims, 'completed', 'The gate verdict is in.', nowMs), result });
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
    const hasSkills = serverSkills().length > 0;
    switch (message.method) {
      case 'server/discover':
        return ok(
          {
            supportedVersions: [...MODERN_PROTOCOL_VERSIONS],
            capabilities: {
              tools: {},
              ...(hasSkills ? { resources: {} } : {}),
              extensions: { ...(hasSkills ? { [SKILLS_EXTENSION]: {} } : {}), [TASKS_EXTENSION]: {} },
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
        const skill = findSkill(uri);
        if (!skill) return fail(reply, message.id, modern, -32602, `unknown resource: ${uri || '(missing uri)'}`);
        return ok({ contents: [{ uri: skill.uri, mimeType: 'text/markdown', text: skill.text }] }, SKILL_CACHE);
      }
      case 'tasks/get':
      case 'tasks/update':
      case 'tasks/cancel':
        return taskMethod(request, reply, message, modern, bearerToken);
      default:
        return null;
    }
  }

  return { route, replier, gateTask };
}
