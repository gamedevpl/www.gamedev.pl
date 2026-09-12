import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Rationale: docs/security-model.md § Browser hardening headers.

export const X_CONTENT_TYPE_OPTIONS = 'nosniff';
export const REFERRER_POLICY = 'strict-origin-when-cross-origin';
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000';
export const FRAME_ANCESTORS_NONE = "frame-ancestors 'none'";
// js13k director's-cut iframes /play/<slug> from its catalog origin.
export const FRAME_ANCESTORS_JS13K = 'frame-ancestors https://js13kgames.com https://www.js13kgames.com';
export const X_FRAME_OPTIONS = 'DENY';
// Same play-permalink grammar as spa-paths.ts PLAY_PREFIX_PATTERN.
const PLAY_PERMALINK = /^\/(?:play|ay|ai)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Never name mic/camera/motion: the game frame delegates them.
export const PERMISSIONS_POLICY = 'geolocation=(), payment=(), usb=(), display-capture=()';

export const CSP_REPORT_PATH = '/api/csp-report';
const CSP_REPORT_BODY_LIMIT = 16 * 1024;

// Report-only; game frames inherit it, so inline stays allowed.
export const APP_CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Google Identity Services, Sign in with Apple, MediaPipe wasm loader.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com/gsi/ https://appleid.cdn-apple.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  // Avatars come from whichever identity provider signed the visitor in.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // storage.googleapis.com: published media redirects there.
  "media-src 'self' data: blob: https://storage.googleapis.com",
  // Realtime hosts over WebSocket; the MediaPipe model file from GCS.
  "connect-src 'self' wss: https://accounts.google.com/gsi/ https://cdn.jsdelivr.net https://storage.googleapis.com",
  "frame-src 'self' blob: https://accounts.google.com/gsi/",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `report-uri ${CSP_REPORT_PATH}`,
].join('; ');

export interface SecurityHeadersOptions {
  // undefined → built-in policy; null → no report-only header.
  cspReportOnly?: string | null;
}

// APP_CSP_REPORT_ONLY: unset/true → built-in; false/off → none; else verbatim policy.
export function resolveCspReportOnly(env: NodeJS.ProcessEnv): string | null {
  const raw = env.APP_CSP_REPORT_ONLY?.trim();
  if (!raw || raw.toLowerCase() === 'true') return APP_CSP_REPORT_ONLY;
  if (raw.toLowerCase() === 'false' || raw.toLowerCase() === 'off') return null;
  return raw;
}

function isHtmlDocument(reply: FastifyReply): boolean {
  const type = reply.getHeader('content-type');
  return typeof type === 'string' && type.toLowerCase().startsWith('text/html');
}

export function isPlayPermalinkPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  const pathname = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return PLAY_PERMALINK.test(pathname);
}

function setIfAbsent(reply: FastifyReply, name: string, value: string): void {
  if (!reply.hasHeader(name)) reply.header(name, value);
}

function pick(report: Record<string, unknown>, key: string): string | number | undefined {
  const value = report[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 512);
  return undefined;
}

const REPORT_FIELDS = [
  ['document-uri', 'documentURL'],
  ['effective-directive', 'effectiveDirective'],
  ['violated-directive', 'violatedDirective'],
  ['blocked-uri', 'blockedURL'],
  ['source-file', 'sourceFile'],
  ['line-number', 'lineNumber'],
  ['disposition', 'disposition'],
] as const;

// Accepts the legacy report-uri envelope and Reporting API batches alike.
export function summarizeCspReport(raw: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ unparsed: true }];
  }
  const bodies: Record<string, unknown>[] = [];
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const body = (entry as { body?: unknown })?.body;
      if (body && typeof body === 'object') bodies.push(body as Record<string, unknown>);
    }
  } else if (parsed && typeof parsed === 'object') {
    const legacy = (parsed as { 'csp-report'?: unknown })['csp-report'];
    bodies.push((legacy && typeof legacy === 'object' ? legacy : parsed) as Record<string, unknown>);
  }
  if (bodies.length === 0) return [{ unparsed: true }];
  return bodies.map((body) => {
    const summary: Record<string, unknown> = {};
    for (const [legacyKey, modernKey] of REPORT_FIELDS) {
      const value = pick(body, legacyKey) ?? pick(body, modernKey);
      if (value !== undefined) summary[modernKey] = value;
    }
    return summary;
  });
}

export function registerSecurityHeaders(app: FastifyInstance, options: SecurityHeadersOptions = {}): void {
  const cspReportOnly = options.cspReportOnly === undefined ? APP_CSP_REPORT_ONLY : options.cspReportOnly;

  app.addHook('onSend', async (request, reply, payload) => {
    setIfAbsent(reply, 'x-content-type-options', X_CONTENT_TYPE_OPTIONS);
    setIfAbsent(reply, 'referrer-policy', REFERRER_POLICY);
    setIfAbsent(reply, 'strict-transport-security', STRICT_TRANSPORT_SECURITY);
    if (!isHtmlDocument(reply)) return payload;
    // A route that wrote its own CSP owns its embedding story.
    if (!reply.hasHeader('content-security-policy')) {
      if (isPlayPermalinkPath(request.url)) {
        reply.header('content-security-policy', FRAME_ANCESTORS_JS13K);
      } else {
        reply.header('content-security-policy', FRAME_ANCESTORS_NONE);
        setIfAbsent(reply, 'x-frame-options', X_FRAME_OPTIONS);
      }
    }
    setIfAbsent(reply, 'permissions-policy', PERMISSIONS_POLICY);
    if (cspReportOnly) setIfAbsent(reply, 'content-security-policy-report-only', cspReportOnly);
    return payload;
  });

  // Fastify knows neither browser report type; unknown types 415 before any handler.
  for (const type of ['application/csp-report', 'application/reports+json']) {
    if (!app.hasContentTypeParser(type)) {
      app.addContentTypeParser(
        type,
        { parseAs: 'string', bodyLimit: CSP_REPORT_BODY_LIMIT },
        (_request, body, done) => {
          done(null, body);
        },
      );
    }
  }

  app.post(
    CSP_REPORT_PATH,
    {
      // Sinks attract filling; real browsers send a handful.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      bodyLimit: CSP_REPORT_BODY_LIMIT,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? null);
      for (const report of summarizeCspReport(raw)) {
        request.log.warn({ cspReport: report }, 'csp violation reported');
      }
      return reply.status(204).send();
    },
  );
}
