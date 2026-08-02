import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { InvalidSessionError, readSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { redirectUriAllowed } from './oauth-redirect.js';
import { verifyPkceS256 } from './oauth-pkce.js';
import {
  AS_ACCESS_TOKEN_TTL_MS,
  AS_AUTH_CODE_TTL_MS,
  AS_REFRESH_TOKEN_TTL_MS,
  buildAsAccessTokenRecord,
  generateAsAccessToken,
  generateAsAuthCode,
  generateAsRefreshToken,
  hashAsTokenSecret,
  looksLikeAsAccessToken,
  looksLikeAsRefreshToken,
  parseAsAccessToken,
  parseAsAuthCode,
  parseAsRefreshToken,
} from './oauth-tokens.js';
import type { OAuthClientRecord, OAuthGrantRecord, Store } from './store.js';

export const OAUTH_AS_METADATA_PATH = '/.well-known/oauth-authorization-server';
const MCP_SCOPE = 'mcp';

const DCR_RATE_LIMIT_MAX = 10;
const DCR_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const cimdCache = new Map<string, { client: OAuthClientRecord; expiresAt: number }>();
const CIMD_CACHE_TTL_MS = 5 * 60 * 1000;

const dcrHitsByIp = new Map<string, number[]>();

export interface OAuthAuthorizationServerOptions {
  store: Store;
  sessionSecret: string;
  sessionSecretPrev?: string;
  now?: () => number;
}

function issuerUrl(): string {
  return canonicalAppBaseUrl();
}

function oauthUrl(path: string): string {
  return `${issuerUrl()}${path}`;
}

function pruneDcrHits(ip: string, nowMs: number): number[] {
  const hits = (dcrHitsByIp.get(ip) ?? []).filter((t) => nowMs - t < DCR_RATE_LIMIT_WINDOW_MS);
  if (hits.length === 0) {
    dcrHitsByIp.delete(ip);
  } else {
    dcrHitsByIp.set(ip, hits);
  }
  return hits;
}

function pruneCimdCache(nowMs: number): void {
  for (const [key, entry] of cimdCache) {
    if (entry.expiresAt <= nowMs) cimdCache.delete(key);
  }
}

function isDcrRateLimited(ip: string, nowMs: number): boolean {
  return pruneDcrHits(ip, nowMs).length >= DCR_RATE_LIMIT_MAX;
}

function noteDcrHit(ip: string, nowMs: number): void {
  const hits = pruneDcrHits(ip, nowMs);
  hits.push(nowMs);
  dcrHitsByIp.set(ip, hits);
}

function readUidFromSession(request: FastifyRequest, sessionSecret: string, sessionSecretPrev?: string): string | null {
  const cookie = request.cookies[SESSION_COOKIE_NAME];
  if (!cookie || typeof cookie !== 'string') return null;
  try {
    const payload = readSessionToken(cookie, sessionSecret, sessionSecretPrev);
    return payload.uid;
  } catch (error) {
    if (error instanceof InvalidSessionError) return null;
    throw error;
  }
}

function pickLang(request: FastifyRequest): 'en' | 'pl' {
  const queryLang =
    typeof (request.query as { lang?: string }).lang === 'string'
      ? (request.query as { lang: string }).lang.trim().toLowerCase()
      : '';
  if (queryLang === 'pl') return 'pl';
  if (queryLang === 'en') return 'en';
  const accept = request.headers['accept-language'];
  if (typeof accept === 'string' && accept.toLowerCase().includes('pl')) return 'pl';
  return 'en';
}

interface CimdDocument {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
}

async function fetchCimdClient(clientIdUrl: string, nowMs: number): Promise<OAuthClientRecord | null> {
  pruneCimdCache(nowMs);
  const cached = cimdCache.get(clientIdUrl);
  if (cached && cached.expiresAt > nowMs) return cached.client;

  let response: Response;
  try {
    response = await fetch(clientIdUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let body: CimdDocument;
  try {
    body = (await response.json()) as CimdDocument;
  } catch {
    return null;
  }

  if (body.client_id !== clientIdUrl) return null;
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) return null;
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') return null;

  const client: OAuthClientRecord = {
    clientId: clientIdUrl,
    registrationType: 'cimd',
    redirectUris: body.redirect_uris,
    clientName: body.client_name,
    tokenEndpointAuthMethod: 'none',
    createdAt: new Date(nowMs).toISOString(),
  };
  cimdCache.set(clientIdUrl, { client, expiresAt: nowMs + CIMD_CACHE_TTL_MS });
  return client;
}

async function resolveOAuthClient(store: Store, clientId: string, nowMs: number): Promise<OAuthClientRecord | null> {
  if (clientId.startsWith('https://')) {
    return fetchCimdClient(clientId, nowMs);
  }
  return store.getOAuthClient(clientId);
}

function clientLabel(client: OAuthClientRecord, redirectUri?: string): string {
  if (redirectUri) {
    try {
      return new URL(redirectUri).host;
    } catch {
      return redirectUri;
    }
  }
  if (client.clientName) return client.clientName;
  if (client.clientId.startsWith('https://')) {
    try {
      return new URL(client.clientId).host;
    } catch {
      return client.clientId;
    }
  }
  return client.clientId;
}

function consentHtml(input: {
  lang: 'en' | 'pl';
  redirectUri: string;
  clientId: string;
  state?: string;
  codeChallenge: string;
  scope: string;
}): string {
  const copy =
    input.lang === 'pl'
      ? {
          title: 'Połącz agenta kodującego',
          lead: 'Agent kodujący prosi o dostęp do Twojego konta gamedev.pl.',
          redirect: 'Po zatwierdzeniu zostaniesz przekierowany na:',
          approve: 'Zatwierdź',
          deny: 'Odmów',
        }
      : {
          title: 'Connect your coding agent',
          lead: 'A coding agent is asking to access your gamedev.pl account.',
          redirect: 'After you approve, you will be sent back to:',
          approve: 'Approve',
          deny: 'Deny',
        };

  const hidden = [
    `<input type="hidden" name="client_id" value="${escapeHtml(input.clientId)}" />`,
    `<input type="hidden" name="redirect_uri" value="${escapeHtml(input.redirectUri)}" />`,
    input.state ? `<input type="hidden" name="state" value="${escapeHtml(input.state)}" />` : '',
    `<input type="hidden" name="code_challenge" value="${escapeHtml(input.codeChallenge)}" />`,
    `<input type="hidden" name="code_challenge_method" value="S256" />`,
    `<input type="hidden" name="scope" value="${escapeHtml(input.scope)}" />`,
    `<input type="hidden" name="response_type" value="code" />`,
  ].join('\n');

  return `<!doctype html>
<html lang="${input.lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${copy.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    .redirect { font-family: ui-monospace, monospace; word-break: break-all; background: #f4f4f5; padding: 0.75rem; border-radius: 0.5rem; }
    .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    button { font: inherit; padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid #ccc; cursor: pointer; }
    .approve { background: #111; color: #fff; border-color: #111; }
  </style>
</head>
<body>
  <h1>${copy.title}</h1>
  <p>${copy.lead}</p>
  <p><strong>${copy.redirect}</strong></p>
  <p class="redirect">${escapeHtml(input.redirectUri)}</p>
  <form method="post" action="/oauth/authorize">
    ${hidden}
    <div class="actions">
      <button type="submit" name="action" value="approve" class="approve">${copy.approve}</button>
      <button type="submit" name="action" value="deny">${copy.deny}</button>
    </div>
  </form>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function oauthErrorRedirect(redirectUri: string, error: string, state?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

function oauthCodeRedirect(redirectUri: string, code: string, state?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

const AuthorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal('S256'),
});

const DcrBodySchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  client_name: z.string().max(200).optional(),
  token_endpoint_auth_method: z.literal('none').optional(),
});

export function registerOAuthAuthorizationServerRoutes(
  app: FastifyInstance,
  options: OAuthAuthorizationServerOptions,
): void {
  const store = options.store;
  const sessionSecret = options.sessionSecret;
  const sessionSecretPrev = options.sessionSecretPrev;
  const now = options.now ?? Date.now;

  if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      const params = new URLSearchParams(body as string);
      const parsed: Record<string, string> = {};
      for (const [key, value] of params) parsed[key] = value;
      done(null, parsed);
    });
  }

  app.get(OAUTH_AS_METADATA_PATH, async (_request, reply) => {
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .type('application/json')
      .send({
        issuer: issuerUrl(),
        authorization_endpoint: oauthUrl('/oauth/authorize'),
        token_endpoint: oauthUrl('/oauth/token'),
        registration_endpoint: oauthUrl('/oauth/register'),
        revocation_endpoint: oauthUrl('/oauth/revoke'),
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: [MCP_SCOPE],
        client_id_metadata_document_supported: true,
      });
  });

  app.post(
    '/oauth/register',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const nowMs = now();
      if (isDcrRateLimited(request.ip, nowMs)) {
        return reply.status(429).send({ error: 'too_many_requests' });
      }

      const parsed = DcrBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'invalid_client_metadata' });
      }

      const body = parsed.data;
      if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') {
        return reply.status(400).send({ error: 'invalid_client_metadata' });
      }

      noteDcrHit(request.ip, nowMs);
      const clientId = randomBytes(16).toString('hex');
      const record: OAuthClientRecord = {
        clientId,
        registrationType: 'dcr',
        redirectUris: body.redirect_uris,
        clientName: body.client_name,
        tokenEndpointAuthMethod: 'none',
        createdAt: new Date(nowMs).toISOString(),
      };
      await store.createOAuthClient(record);

      return reply.status(201).send({
        client_id: clientId,
        client_id_issued_at: Math.floor(nowMs / 1000),
        redirect_uris: record.redirectUris,
        token_endpoint_auth_method: 'none',
        ...(record.clientName ? { client_name: record.clientName } : {}),
      });
    },
  );

  async function validateAuthorizeParams(
    request: FastifyRequest,
  ): Promise<
    | { ok: true; params: z.infer<typeof AuthorizeQuerySchema>; client: OAuthClientRecord }
    | { ok: false; status: number; error: string }
  > {
    const raw = request.method === 'GET' ? request.query : request.body;
    const parsed = AuthorizeQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, status: 400, error: 'invalid_request' };
    }
    const params = parsed.data;
    if ((params.scope ?? MCP_SCOPE) !== MCP_SCOPE) {
      return { ok: false, status: 400, error: 'invalid_scope' };
    }

    const client = await resolveOAuthClient(store, params.client_id, now());
    if (!client) return { ok: false, status: 400, error: 'invalid_client' };
    if (!redirectUriAllowed(params.redirect_uri, client.redirectUris)) {
      return { ok: false, status: 400, error: 'invalid_redirect_uri' };
    }

    return { ok: true, params, client };
  }

  app.get('/oauth/authorize', async (request, reply) => {
    const uid = readUidFromSession(request, sessionSecret, sessionSecretPrev);
    if (!uid) {
      const returnTo = `${request.url}`;
      return reply.redirect(`${issuerUrl()}/studio?oauth_return=${encodeURIComponent(returnTo)}`);
    }

    const validated = await validateAuthorizeParams(request);
    if (!validated.ok) {
      return reply.status(validated.status).send({ error: validated.error });
    }

    const { params } = validated;
    return reply.type('text/html').send(
      consentHtml({
        lang: pickLang(request),
        redirectUri: params.redirect_uri,
        clientId: params.client_id,
        state: params.state,
        codeChallenge: params.code_challenge,
        scope: params.scope ?? MCP_SCOPE,
      }),
    );
  });

  app.post('/oauth/authorize', async (request, reply) => {
    const uid = readUidFromSession(request, sessionSecret, sessionSecretPrev);
    if (!uid) {
      return reply.status(401).send({ error: 'login_required' });
    }

    const validated = await validateAuthorizeParams(request);
    if (!validated.ok) {
      return reply.status(validated.status).send({ error: validated.error });
    }

    const { params } = validated;
    const action =
      typeof (request.body as { action?: string }).action === 'string'
        ? (request.body as { action: string }).action
        : 'deny';

    if (action !== 'approve') {
      return reply.redirect(oauthErrorRedirect(params.redirect_uri, 'access_denied', params.state));
    }

    const nowMs = now();
    const grantId = randomUUID();
    const grant: OAuthGrantRecord = {
      grantId,
      clientId: params.client_id,
      ownerUid: uid,
      scope: MCP_SCOPE,
      createdAt: new Date(nowMs).toISOString(),
      refreshFamilyId: grantId,
      currentRefreshTokenId: '',
      currentRefreshHash: '',
      refreshExpiresAt: new Date(nowMs + AS_REFRESH_TOKEN_TTL_MS).toISOString(),
    };
    await store.createOAuthGrant(grant);

    const authCode = generateAsAuthCode();
    await store.createOAuthAuthCode({
      codeId: authCode.codeId,
      codeHash: authCode.codeHash,
      clientId: params.client_id,
      ownerUid: uid,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: 'S256',
      scope: MCP_SCOPE,
      expiresAt: new Date(nowMs + AS_AUTH_CODE_TTL_MS).toISOString(),
      grantId,
    });

    return reply.redirect(oauthCodeRedirect(params.redirect_uri, authCode.code, params.state));
  });

  app.post('/oauth/token', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'invalid_request' });
    }
    const grantType =
      typeof (body as { grant_type?: string }).grant_type === 'string'
        ? (body as { grant_type: string }).grant_type
        : '';

    const nowMs = now();

    if (grantType === 'authorization_code') {
      const code = typeof (body as { code?: string }).code === 'string' ? (body as { code: string }).code.trim() : '';
      const redirectUri =
        typeof (body as { redirect_uri?: string }).redirect_uri === 'string'
          ? (body as { redirect_uri: string }).redirect_uri.trim()
          : '';
      const clientId =
        typeof (body as { client_id?: string }).client_id === 'string'
          ? (body as { client_id: string }).client_id.trim()
          : '';
      const verifier =
        typeof (body as { code_verifier?: string }).code_verifier === 'string'
          ? (body as { code_verifier: string }).code_verifier.trim()
          : '';

      if (!code || !redirectUri || !clientId || !verifier) {
        return reply.status(400).send({ error: 'invalid_request' });
      }

      let parsedCode: { codeId: string; secretHalf: string };
      try {
        parsedCode = parseAsAuthCode(code);
      } catch {
        return reply.status(400).send({ error: 'invalid_grant' });
      }

      const consumed = await store.consumeOAuthAuthCode(
        parsedCode.codeId,
        hashAsTokenSecret(parsedCode.secretHalf),
        nowMs,
      );
      if (!consumed) return reply.status(400).send({ error: 'invalid_grant' });
      if (consumed.clientId !== clientId) return reply.status(400).send({ error: 'invalid_grant' });
      if (!redirectUriAllowed(redirectUri, [consumed.redirectUri])) {
        return reply.status(400).send({ error: 'invalid_grant' });
      }
      if (!verifyPkceS256(verifier, consumed.codeChallenge)) {
        return reply.status(400).send({ error: 'invalid_grant' });
      }

      const grant = consumed.grantId ? await store.getOAuthGrant(consumed.grantId) : null;
      if (!grant || grant.revokedAt) return reply.status(400).send({ error: 'invalid_grant' });

      const access = generateAsAccessToken();
      const refresh = generateAsRefreshToken();
      const accessRecord = buildAsAccessTokenRecord(access, grant, nowMs);
      const issued = await store.issueOAuthTokensFromGrant({
        grantId: grant.grantId,
        refreshTokenId: refresh.tokenId,
        refreshHash: refresh.secretHash,
        refreshExpiresAt: new Date(nowMs + AS_REFRESH_TOKEN_TTL_MS).toISOString(),
        accessToken: accessRecord,
        nowMs,
      });
      if (!issued) return reply.status(400).send({ error: 'invalid_grant' });

      return reply.send({
        access_token: access.token,
        refresh_token: refresh.token,
        expires_in: Math.floor(AS_ACCESS_TOKEN_TTL_MS / 1000),
        token_type: 'Bearer',
        scope: grant.scope,
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken =
        typeof (body as { refresh_token?: string }).refresh_token === 'string'
          ? (body as { refresh_token: string }).refresh_token.trim()
          : '';
      if (!refreshToken) return reply.status(400).send({ error: 'invalid_request' });

      let parsed: { tokenId: string; secretHalf: string };
      try {
        parsed = parseAsRefreshToken(refreshToken);
      } catch {
        return reply.status(400).send({ error: 'invalid_grant' });
      }

      const grant = await store.getOAuthGrantByRefreshTokenId(parsed.tokenId);
      if (!grant) return reply.status(400).send({ error: 'invalid_grant' });

      const access = generateAsAccessToken();
      const accessRecord = buildAsAccessTokenRecord(access, grant, nowMs);
      const nextRefresh = generateAsRefreshToken();
      const rotateResult = await store.rotateOAuthRefreshToken({
        refreshTokenId: parsed.tokenId,
        refreshSecretHash: hashAsTokenSecret(parsed.secretHalf),
        newRefreshTokenId: nextRefresh.tokenId,
        newRefreshHash: nextRefresh.secretHash,
        newRefreshExpiresAt: new Date(nowMs + AS_REFRESH_TOKEN_TTL_MS).toISOString(),
        newAccessToken: accessRecord,
        nowMs,
      });

      if (!rotateResult.ok) {
        return reply.status(400).send({ error: 'invalid_grant' });
      }

      return reply.send({
        access_token: access.token,
        refresh_token: nextRefresh.token,
        expires_in: Math.floor(AS_ACCESS_TOKEN_TTL_MS / 1000),
        token_type: 'Bearer',
        scope: rotateResult.grant.scope,
      });
    }

    return reply.status(400).send({ error: 'unsupported_grant_type' });
  });

  app.post('/oauth/revoke', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'invalid_request' });
    }

    const token =
      typeof (body as { token?: string }).token === 'string' ? (body as { token: string }).token.trim() : '';
    if (!token) return reply.status(400).send({ error: 'invalid_request' });

    let grantId: string | null = null;

    if (looksLikeAsRefreshToken(token)) {
      try {
        const parsed = parseAsRefreshToken(token);
        const grant = await store.getOAuthGrantByRefreshTokenId(parsed.tokenId);
        grantId = grant?.grantId ?? null;
      } catch {
        grantId = null;
      }
    } else if (looksLikeAsAccessToken(token)) {
      try {
        const parsed = parseAsAccessToken(token);
        const access = await store.getOAuthAccessToken(parsed.tokenId);
        grantId = access?.grantId ?? null;
      } catch {
        grantId = null;
      }
    }

    if (grantId) {
      const grant = await store.getOAuthGrant(grantId);
      if (grant) {
        await store.revokeOAuthGrant(grantId, grant.ownerUid);
      }
    }

    return reply.status(200).send({});
  });

  app.get('/api/me/oauth-grants', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const grants = await store.listOAuthGrantsByOwner(uid);
    const payload = await Promise.all(
      grants.map(async (grant) => {
        const client = await resolveOAuthClient(store, grant.clientId, now());
        const redirectHost = client?.redirectUris[0];
        return {
          grantId: grant.grantId,
          clientId: grant.clientId,
          clientLabel: client ? clientLabel(client, redirectHost) : grant.clientId,
          createdAt: grant.createdAt,
          lastUsedAt: grant.lastUsedAt ?? null,
        };
      }),
    );
    return reply.send(payload);
  });

  app.delete('/api/me/oauth-grants/:grantId', async (request, reply) => {
    const uid = request.user?.uid;
    if (!uid) return reply.status(401).send({ error: 'unauthorized' });

    const grantId = (request.params as { grantId: string }).grantId;
    const revoked = await store.revokeOAuthGrant(grantId, uid);
    if (!revoked) return reply.status(404).send({ error: 'not_found' });
    return reply.status(204).send();
  });
}
