/**
 * Structured MCP debug fields for Cloud Logging — never include credentials.
 *
 * ChatGPT / Claude connectors often drop `isError` tool payloads from the chat
 * transcript, so the only durable signal for "why did get_brief fail after start"
 * is what we write here. Grep: `jsonPayload.event="mcp_tool_refused"` or
 * `jsonPayload.msg="mcp tool refused"`.
 */

import { looksLikeCreatorAgentKey } from './agent-creator-key.js';
import { looksLikeGameAgentKey } from './agent-game-key.js';
import { looksLikeMcpSessionKey, verifyMcpSessionKey } from './mcp-session-key.js';
import { looksLikeAsAccessToken } from '../oauth-tokens.js';

export type McpBearerKind = 'none' | 'oauth' | 'creator_key' | 'game_key' | 'round_or_other';
export type McpSessionKeyShape = 'absent' | 'session' | 'game_key' | 'creator_key' | 'other';

export function classifyMcpBearerKind(bearer: string | null | undefined): McpBearerKind {
  if (!bearer) return 'none';
  if (looksLikeAsAccessToken(bearer)) return 'oauth';
  if (looksLikeCreatorAgentKey(bearer)) return 'creator_key';
  if (looksLikeGameAgentKey(bearer)) return 'game_key';
  return 'round_or_other';
}

export function classifyMcpSessionKeyShape(sessionKey: string | null | undefined): McpSessionKeyShape {
  if (!sessionKey) return 'absent';
  if (looksLikeMcpSessionKey(sessionKey)) return 'session';
  if (looksLikeGameAgentKey(sessionKey)) return 'game_key';
  if (looksLikeCreatorAgentKey(sessionKey)) return 'creator_key';
  return 'other';
}

/** Claims peek for logging only — never log the raw sessionKey. */
export function peekMcpSessionKeyForLog(
  sessionKey: string | null | undefined,
  secret: string | undefined,
): { jobId: number; boundSessionId: string; roundGeneration: number } | null {
  if (!sessionKey || !secret || !looksLikeMcpSessionKey(sessionKey)) return null;
  try {
    const claims = verifyMcpSessionKey(sessionKey, secret);
    return {
      jobId: claims.jobId,
      boundSessionId: claims.sessionId,
      roundGeneration: claims.roundGeneration,
    };
  } catch {
    return null;
  }
}

export function mcpToolRefusalFields(input: {
  tool: string;
  reason: string;
  bearer: string | null | undefined;
  sessionKey: string | null | undefined;
  transportSessionId: string | null | undefined;
  agentTokenSecret?: string;
  userAgent?: string | null;
}): Record<string, unknown> {
  const peeked = peekMcpSessionKeyForLog(input.sessionKey, input.agentTokenSecret);
  const transportSessionId = input.transportSessionId ?? null;
  return {
    event: 'mcp_tool_refused',
    tool: input.tool,
    reason: input.reason,
    bearerKind: classifyMcpBearerKind(input.bearer),
    sessionKeyShape: classifyMcpSessionKeyShape(input.sessionKey),
    transportSessionId,
    ...(peeked
      ? {
          jobId: peeked.jobId,
          boundSessionId: peeked.boundSessionId,
          roundGeneration: peeked.roundGeneration,
          sessionIdMismatch: Boolean(transportSessionId && transportSessionId !== peeked.boundSessionId),
        }
      : {}),
    ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 120) } : {}),
  };
}

export function mcpSessionStartedFields(input: {
  jobId: number;
  slug: string | null;
  sessionId: string;
  round: number;
  userAgent?: string | null;
}): Record<string, unknown> {
  return {
    event: 'mcp_session_started',
    tool: 'start',
    jobId: input.jobId,
    slug: input.slug,
    sessionId: input.sessionId,
    round: input.round,
    ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 120) } : {}),
  };
}

export function toolErrorReason(result: {
  isError?: boolean;
  structuredContent?: unknown;
  /**
   * `text` is optional because a tool result may carry non-text blocks —
   * `get_gate_media` attaches the gate's opening frame as an MCP image. The read
   * below is already guarded, and a refusal is always text (see `toolErr`), so this
   * widening costs nothing and keeps this module independent of the tool union.
   */
  content?: Array<{ type: string; text?: string }>;
}): string | null {
  if (!result.isError) return null;
  const structured = result.structuredContent;
  if (structured && typeof structured === 'object' && 'error' in structured) {
    const error = (structured as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error.trim();
  }
  const text = result.content?.[0]?.text;
  if (typeof text === 'string' && text.trim()) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    } catch {
      return text.trim().slice(0, 300);
    }
  }
  return 'unknown error';
}
