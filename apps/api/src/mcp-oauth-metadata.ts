import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readBearerToken } from './bearer.js';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { MCP_ENDPOINT_PATH, mcpEndpointUrl } from './self-build-connect.js';

/** RFC 9728 protected-resource metadata document (BY-18a). */
export const OAUTH_PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';

const METADATA_CACHE_CONTROL = 'public, max-age=3600';

interface JsonRpcMessage {
  method?: string;
  params?: unknown;
}

function parseAuthorizationServers(): string[] | undefined {
  const raw = process.env.MCP_AUTHORIZATION_SERVERS?.trim();
  if (!raw) return undefined;
  const servers = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return servers.length > 0 ? servers : undefined;
}

function resourceDocumentationUrl(): string {
  const configured = process.env.MCP_RESOURCE_DOCUMENTATION_URL?.trim();
  if (configured) return configured;
  return `${canonicalAppBaseUrl()}/studio`;
}

/** Absolute URL of the PRM document — always from the canonical origin, never Host. */
export function oauthProtectedResourceMetadataUrl(): string {
  return `${canonicalAppBaseUrl()}${OAUTH_PROTECTED_RESOURCE_PATH}`;
}

export function buildOAuthProtectedResourceDocument(): Record<string, unknown> {
  const document: Record<string, unknown> = {
    resource: mcpEndpointUrl(canonicalAppBaseUrl()),
    bearer_methods_supported: ['header'],
    resource_documentation: resourceDocumentationUrl(),
  };
  const authorizationServers = parseAuthorizationServers();
  if (authorizationServers) {
    document.authorization_servers = authorizationServers;
  }
  return document;
}

export function buildMcpOAuthAuthenticateHeader(): string {
  return `Bearer resource_metadata="${oauthProtectedResourceMetadataUrl()}"`;
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * True when the JSON-RPC message is one that requires a build credential and the
 * request presents none at the HTTP or tool-argument layer.
 */
export function mcpRequestLacksCredential(request: FastifyRequest, message: JsonRpcMessage): boolean {
  if (readBearerToken(request.headers.authorization)) return false;

  if (message.method !== 'tools/call') return false;

  const params = message.params;
  if (!params || typeof params !== 'object') return true;

  const toolParams = params as { name?: string; arguments?: Record<string, unknown> };
  const args = toolParams.arguments;
  if (!args || typeof args !== 'object') return true;

  if (nonEmptyString(args.sessionKey)) return false;

  const toolName = nonEmptyString(toolParams.name);
  if (
    (toolName === 'start' || toolName === 'open_round' || toolName === 'continue_draft') &&
    nonEmptyString(args.key)
  ) {
    return false;
  }

  return true;
}

/** Protocol methods that never receive an OAuth challenge — existing clients handshake here. */
export function mcpMethodAllowsAnonymousHandshake(method: string | undefined): boolean {
  if (!method) return true;
  if (method === 'initialize') return true;
  if (method === 'ping') return true;
  if (method === 'tools/list') return true;
  if (method.startsWith('notifications/')) return true;
  return false;
}

export function shouldIssueMcpOAuthChallenge(request: FastifyRequest, message: JsonRpcMessage): boolean {
  if (mcpMethodAllowsAnonymousHandshake(message.method)) return false;
  if (message.method !== 'tools/call') return false;
  return mcpRequestLacksCredential(request, message);
}

/**
 * What an agent must actually DO about a missing credential.
 *
 * The challenge replaced a tool-level error that carried this sentence, and a status
 * code is not an instruction: an agent that drops `sessionKey` on one call needs to be
 * told to re-send it, not pointed at an authorization server that does not exist yet.
 * Exported so the tool-level refusal in `mcp-server.ts` and this HTTP challenge cannot
 * drift into saying different things.
 */
export const MCP_MISSING_CREDENTIAL_HINT =
  'missing credential: pass sessionKey from start(), or call start() first — a game key goes in its key ' +
  'argument; a creator key or OAuth access goes in Authorization: Bearer with your game slug';

/**
 * Closed beta changes what "missing credential" means, so the hint has to change with it.
 *
 * The sentence above tells an agent to go find a key. During private beta a visitor
 * without an account cannot obtain one at all, so following that advice is a dead end —
 * and a directory listing puts exactly that visitor here: anonymous `initialize` and
 * `tools/list` succeed, all tools look healthy, and the first write is where they learn
 * the product is closed. Say it in this string specifically, because it is the only
 * explanation that reaches a client which never opens a browser — headless agents, and
 * Cursor desktop while its OAuth stalls after DCR.
 *
 * This is product state, not a per-user verdict: it says the door is closed, never
 * whether a particular account is on the allowlist.
 */
export const MCP_CLOSED_BETA_HINT =
  'gamedev.pl is in closed beta — if you do not have a creator account yet there is no key to pass. ' +
  'Join the waitlist at https://www.gamedev.pl/ and connect again once you are approved';

export function mcpMissingCredentialHint(privateBeta = false): string {
  return privateBeta ? `${MCP_MISSING_CREDENTIAL_HINT}. ${MCP_CLOSED_BETA_HINT}` : MCP_MISSING_CREDENTIAL_HINT;
}

export function sendMcpOAuthChallenge(reply: FastifyReply, privateBeta = false): FastifyReply {
  return reply
    .status(401)
    .header('WWW-Authenticate', buildMcpOAuthAuthenticateHeader())
    .send({ error: 'authentication required', hint: mcpMissingCredentialHint(privateBeta) });
}

/**
 * RFC 9728 path insertion: for resource `https://host/api/mcp`, clients also probe
 * `/.well-known/oauth-protected-resource/api/mcp`. Claude Code and Cursor hit the
 * path-suffixed URL first; a 404 is recoverable (they fall back to the root document)
 * but wastes a round trip and breaks callers that lose the WWW-Authenticate
 * `resource_metadata` URL across the OAuth redirect (Cursor forum #151331).
 */
export function oauthProtectedResourcePathForMcp(): string {
  const suffix = MCP_ENDPOINT_PATH.replace(/^\/+/, '');
  return `${OAUTH_PROTECTED_RESOURCE_PATH}/${suffix}`;
}

export function registerOAuthProtectedResourceRoutes(app: FastifyInstance): void {
  const sendDocument = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .header('Cache-Control', METADATA_CACHE_CONTROL)
      .type('application/json')
      .send(buildOAuthProtectedResourceDocument());
  };

  app.get(OAUTH_PROTECTED_RESOURCE_PATH, sendDocument);
  app.get(oauthProtectedResourcePathForMcp(), sendDocument);
}
