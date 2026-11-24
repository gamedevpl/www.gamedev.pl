// MCP 2026-07-28: stateless per-request _meta, served beside legacy initialize.

export const MODERN_PROTOCOL_VERSION = '2026-07-28';
export const MODERN_PROTOCOL_VERSIONS: ReadonlySet<string> = new Set([MODERN_PROTOCOL_VERSION]);

export const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
export const META_CLIENT_INFO = 'io.modelcontextprotocol/clientInfo';
export const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

export const SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';
export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';

// Error codes added by the modern revision.
export const HEADER_MISMATCH = -32020;
export const MISSING_CLIENT_CAPABILITY = -32021;
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;

export interface ModernRequest {
  protocolVersion: string;
  clientCapabilities: Record<string, unknown>;
}

export interface ModernRejection {
  status: number;
  code: number;
  message: string;
  data?: unknown;
}

interface Message {
  method?: string;
  params?: unknown;
}

type Headers = Record<string, string | string[] | undefined>;

function header(headers: Headers, name: string): string | null {
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : null;
}

// Non-ASCII header values travel as `=?base64?<b64>?=`.
function decodeHeader(value: string): string {
  const match = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(value);
  return match ? Buffer.from(match[1]!, 'base64').toString('utf8') : value;
}

function meta(message: Message): Record<string, unknown> | null {
  const params = message.params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const raw = (params as { _meta?: unknown })._meta;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

// Modern when _meta names a version, or the method is server/discover.
export function isModernRequest(message: Message): boolean {
  if (message.method === 'server/discover') return true;
  return meta(message)?.[META_PROTOCOL_VERSION] !== undefined;
}

// The Mcp-Name target a method requires, if any.
function nameTarget(message: Message): string | null {
  const params = (message.params ?? {}) as Record<string, unknown>;
  if (message.method === 'tools/call' || message.method === 'prompts/get') {
    return typeof params.name === 'string' ? params.name : '';
  }
  if (message.method === 'resources/read') return typeof params.uri === 'string' ? params.uri : '';
  if (message.method === 'tasks/get' || message.method === 'tasks/update' || message.method === 'tasks/cancel') {
    return typeof params.taskId === 'string' ? params.taskId : '';
  }
  return null;
}

// Validates per-request _meta and headers; returns the request or a refusal.
export function readModernRequest(
  message: Message,
  headers: Headers,
  legacyVersions: Iterable<string>,
): ModernRequest | ModernRejection {
  const fields = meta(message);
  const version = fields?.[META_PROTOCOL_VERSION];
  if (typeof version !== 'string' || !version) {
    return { status: 400, code: -32602, message: `missing _meta["${META_PROTOCOL_VERSION}"]` };
  }
  if (!MODERN_PROTOCOL_VERSIONS.has(version)) {
    return {
      status: 400,
      code: UNSUPPORTED_PROTOCOL_VERSION,
      message: 'Unsupported protocol version',
      data: { supported: [...MODERN_PROTOCOL_VERSIONS, ...legacyVersions], requested: version },
    };
  }
  const capabilities = fields?.[META_CLIENT_CAPABILITIES];
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    return { status: 400, code: -32602, message: `missing _meta["${META_CLIENT_CAPABILITIES}"]` };
  }

  const headerVersion = header(headers, 'mcp-protocol-version');
  if (headerVersion !== version) {
    return {
      status: 400,
      code: HEADER_MISMATCH,
      message: `Header mismatch: MCP-Protocol-Version ${headerVersion === null ? 'is missing' : `'${headerVersion}' does not match body value '${version}'`}`,
    };
  }
  const method = header(headers, 'mcp-method');
  if (method === null || decodeHeader(method) !== message.method) {
    return {
      status: 400,
      code: HEADER_MISMATCH,
      message: `Header mismatch: Mcp-Method ${method === null ? 'is missing' : `'${method}' does not match body value '${message.method}'`}`,
    };
  }
  const target = nameTarget(message);
  if (target !== null) {
    const name = header(headers, 'mcp-name');
    if (name === null || decodeHeader(name) !== target) {
      return {
        status: 400,
        code: HEADER_MISMATCH,
        message: `Header mismatch: Mcp-Name ${name === null ? 'is missing' : 'does not match the body value'}`,
      };
    }
  }
  return { protocolVersion: version, clientCapabilities: capabilities as Record<string, unknown> };
}

export function isModernRejection(value: ModernRequest | ModernRejection): value is ModernRejection {
  return 'code' in value;
}

// True when the client declared this extension.
export function clientHasExtension(request: ModernRequest, extension: string): boolean {
  const extensions = request.clientCapabilities.extensions;
  return Boolean(
    extensions &&
    typeof extensions === 'object' &&
    !Array.isArray(extensions) &&
    (extensions as Record<string, unknown>)[extension] !== undefined,
  );
}

export interface CachePolicy {
  ttlMs: number;
  cacheScope: 'public' | 'private';
}

// Adds resultType, serverInfo and cache fields to a modern result.
export function modernResult(
  result: Record<string, unknown>,
  serverInfo: { name: string; version: string },
  cache?: CachePolicy,
): Record<string, unknown> {
  const priorMeta =
    result._meta && typeof result._meta === 'object' && !Array.isArray(result._meta)
      ? (result._meta as Record<string, unknown>)
      : {};
  return {
    resultType: 'complete',
    ...result,
    ...(cache ?? {}),
    _meta: { ...priorMeta, [META_SERVER_INFO]: serverInfo },
  };
}

// Unknown methods answer 404; other refusals 400.
export function modernErrorStatus(code: number): number {
  return code === -32601 ? 404 : 400;
}
