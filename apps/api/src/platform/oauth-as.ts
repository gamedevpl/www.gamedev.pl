import { randomBytes, randomUUID } from 'node:crypto';
import type { Locale } from '@gamedevpl/contract';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { rememberBounded } from './bounded-map.js';
import { createCimdFetcher, type CimdFetcher, validateCimdUrl } from './cimd-fetch.js';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { endOpenAgentSessions } from '../agent-surface/agent-session-revocation.js';
import { isRateLimited } from './ip-rate-limit.js';
import { cliSurfaceEnabled } from './cli-surface.js';
import { DEVICE_GRANT_TYPE, exchangeDeviceCode, registerOAuthDeviceRoutes } from './oauth-device.js';
import { activeSessionUid, consentHtml, consentToken, consentTokenValid } from './oauth-consent.js';
import {
  gamedevCliClient,
  gamedevCliGrantLabel,
  isGamedevCliClient,
  sameCliDeviceGrant,
  sanitizeDeviceName,
} from './oauth-first-party.js';
import {
  advertisedOAuthScopes,
  formatOAuthScope,
  MAX_OAUTH_GRANTS_PER_UID,
  OAUTH_GRANT_CAP_DESCRIPTION,
  parseOAuthScopes,
  scopeHasMcp,
} from './oauth-scopes.js';
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
export { consentToken } from './oauth-consent.js';

const DCR_RATE_LIMIT_MAX = 10;
const DCR_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const cimdCache = new Map<string, { client: OAuthClientRecord; expiresAt: number }>();
const CIMD_CACHE_TTL_MS = 5 * 60 * 1000;
const cimdFailures = new Map<string, number>();
const cimdInFlight = new Map<string, Promise<OAuthClientRecord | null>>();
const cimdHitsByUid = new Map<string, { urls: Map<string, number>; expiresAt: number }>();
const CIMD_FAILURE_TTL_MS = 60 * 1000;
const CIMD_USER_WINDOW_MS = 10 * 60 * 1000;

const dcrHitsByIp = new Map<string, number[]>();
const tokenHitsByIp = new Map<string, number[]>();
const TOKEN_RATE_LIMIT_MAX = 60;
const TOKEN_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export interface OAuthAuthorizationServerOptions {
  store: Store;
  sessionSecret: string;
  sessionSecretPrev?: string;
  now?: () => number;
  cimdFetcher?: CimdFetcher;
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
  for (const [key, expiresAt] of cimdFailures) {
    if (expiresAt <= nowMs) cimdFailures.delete(key);
  }
}

function allowCimdUrl(uid: string, url: string, nowMs: number): boolean {
  const entry = cimdHitsByUid.get(uid);
  const urls = entry?.urls ?? new Map<string, number>();
  for (const [key, at] of urls) if (nowMs - at >= CIMD_USER_WINDOW_MS) urls.delete(key);
  if (!urls.has(url) && urls.size >= 10) return false;
  urls.set(url, nowMs);
  rememberBounded(cimdHitsByUid, uid, { urls, expiresAt: nowMs + CIMD_USER_WINDOW_MS }, 256);
  return true;
}

function isDcrRateLimited(ip: string, nowMs: number): boolean {
  return pruneDcrHits(ip, nowMs).length >= DCR_RATE_LIMIT_MAX;
}

function noteDcrHit(ip: string, nowMs: number): void {
  const hits = pruneDcrHits(ip, nowMs);
  hits.push(nowMs);
  dcrHitsByIp.set(ip, hits);
}

function pickLang(request: FastifyRequest): Locale {
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

const CimdDocumentSchema = z.object({
  client_id: z.string(),
  client_name: z.string().max(100).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  token_endpoint_auth_method: z.string().optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
});

function validCimdRedirect(uri: string): boolean {
  const url = new URL(uri);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) && redirectUriAllowed(uri, [uri]);
}

// Prefer Choices list; ChatGPT prefers private_key_jwt but also supports none.
export function cimdSupportsPublicClientAuth(body: {
  token_endpoint_auth_method?: string;
  token_endpoint_auth_methods_supported?: string[];
}): boolean {
  const supported = body.token_endpoint_auth_methods_supported;
  if (Array.isArray(supported) && supported.length > 0) {
    return supported.includes('none');
  }
  const method = body.token_endpoint_auth_method;
  return method === undefined || method === 'none';
}

async function fetchCimdClient(
  clientIdUrl: string,
  nowMs: number,
  fetcher: CimdFetcher,
): Promise<OAuthClientRecord | null> {
  pruneCimdCache(nowMs);
  const cached = cimdCache.get(clientIdUrl);
  if (cached && cached.expiresAt > nowMs) return cached.client;
  if ((cimdFailures.get(clientIdUrl) ?? 0) > nowMs) return null;
  const pending = cimdInFlight.get(clientIdUrl);
  if (pending) return pending;
  const work = (async () => {
    let result;
    try {
      result = await fetcher(clientIdUrl);
    } catch {
      rememberBounded(cimdFailures, clientIdUrl, nowMs + CIMD_FAILURE_TTL_MS, 256);
      return null;
    }
    const parsed = result.ok ? CimdDocumentSchema.safeParse(result.body) : null;
    const body = parsed?.success ? parsed.data : null;
    if (
      !result.ok ||
      !body ||
      body.client_id !== clientIdUrl ||
      !body.redirect_uris.every(validCimdRedirect) ||
      !cimdSupportsPublicClientAuth(body)
    ) {
      rememberBounded(cimdFailures, clientIdUrl, nowMs + CIMD_FAILURE_TTL_MS, 256);
      return null;
    }

    const client: OAuthClientRecord = {
      clientId: clientIdUrl,
      registrationType: 'cimd',
      redirectUris: body.redirect_uris,
      clientName: body.client_name,
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date(nowMs).toISOString(),
    };
    rememberBounded(cimdCache, clientIdUrl, { client, expiresAt: nowMs + CIMD_CACHE_TTL_MS }, 256);
    return client;
  })();
  cimdInFlight.set(clientIdUrl, work);
  try {
    return await work;
  } finally {
    cimdInFlight.delete(clientIdUrl);
  }
}

async function resolveOAuthClient(
  store: Store,
  clientId: string,
  nowMs: number,
  fetcher: CimdFetcher,
  options: { uid?: string; network?: boolean } = {},
): Promise<OAuthClientRecord | null> {
  if (isGamedevCliClient(clientId)) return gamedevCliClient();
  if (clientId.startsWith('https://')) {
    if (!validateCimdUrl(clientId)) return null;
    pruneCimdCache(nowMs);
    const cached = cimdCache.get(clientId);
    if (cached && cached.expiresAt > nowMs) return cached.client;
    if (options.network === false) return null;
    if ((cimdFailures.get(clientId) ?? 0) > nowMs) return null;
    if (options.uid && !allowCimdUrl(options.uid, clientId, nowMs)) return null;
    return fetchCimdClient(clientId, nowMs, fetcher);
  }
  return store.getOAuthClient(clientId);
}

function clientLabel(client: OAuthClientRecord, grant?: OAuthGrantRecord, redirectUri?: string): string {
  if (isGamedevCliClient(client.clientId)) {
    return gamedevCliGrantLabel(grant?.deviceName ?? 'this device');
  }
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

function oauthErrorRedirect(redirectUri: string, error: string, state?: string, description?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state) url.searchParams.set('state', state);
  if (description) url.searchParams.set('error_description', description);
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
  device: z.string().max(40).optional(),
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
  const rawCimdFetcher = options.cimdFetcher ?? createCimdFetcher();
  const cimdFetcher: CimdFetcher = async (url) => {
    const result = await rawCimdFetcher(url);
    if (!result.ok)
      app.log.warn({ host: new URL(url).host, reason: result.reason }, 'OAuth client metadata fetch failed');
    return result;
  };

  if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      const params = new URLSearchParams(body as string);
      const parsed: Record<string, string> = {};
      for (const [key, value] of params) parsed[key] = value;
      done(null, parsed);
    });
  }

  registerOAuthDeviceRoutes(app, { sessionSecret, now });

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
        grant_types_supported: cliSurfaceEnabled()
          ? ['authorization_code', 'refresh_token', DEVICE_GRANT_TYPE]
          : ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: advertisedOAuthScopes(),
        ...(cliSurfaceEnabled() ? { device_authorization_endpoint: oauthUrl('/oauth/device') } : {}),
        client_id_metadata_document_supported: true,
      });
  });

  app.post(
    '/oauth/register',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const nowMs = now();
      if (isDcrRateLimited(request.clientIp, nowMs)) {
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

      noteDcrHit(request.clientIp, nowMs);
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
    uid: string,
  ): Promise<
    | { ok: true; params: z.infer<typeof AuthorizeQuerySchema>; client: OAuthClientRecord; scope: string }
    | { ok: false; status: number; error: string }
  > {
    const raw = request.method === 'GET' ? request.query : request.body;
    const parsed = AuthorizeQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, status: 400, error: 'invalid_request' };
    }
    const params = parsed.data;
    const scopes = parseOAuthScopes(params.scope);
    if (!scopes) {
      return { ok: false, status: 400, error: 'invalid_scope' };
    }

    const client = await resolveOAuthClient(store, params.client_id, now(), cimdFetcher, { uid });
    if (!client) return { ok: false, status: 400, error: 'invalid_client' };
    if (!redirectUriAllowed(params.redirect_uri, client.redirectUris)) {
      return { ok: false, status: 400, error: 'invalid_redirect_uri' };
    }

    return { ok: true, params, client, scope: formatOAuthScope(scopes) };
  }

  app.get('/oauth/authorize', async (request, reply) => {
    const uid = activeSessionUid(request);
    if (!uid) {
      const returnTo = `${request.url}`;
      return reply.redirect(`${issuerUrl()}/studio?oauth_return=${encodeURIComponent(returnTo)}`);
    }

    const validated = await validateAuthorizeParams(request, uid);
    if (!validated.ok) {
      return reply.status(validated.status).send({ error: validated.error });
    }

    const { params, client, scope } = validated;
    const lang = pickLang(request);
    const user = await store.getUser(uid);

    // NOT gated on beta access here, deliberately. A waitlisted creator can still approve
    // and then meet the wall at their agent's first call, which is a bad late failure —
    // but the access rule in auth.ts is three-way (betaAllowedUids, betaAllowedEmails,
    // then the waitlist), and checking only the waitlist would refuse every creator
    // allowlisted by environment, which is most of the ones using this. Fixing the late
    // failure means extracting that predicate so both places share it, not copying a
    // third of it here.

    return reply.type('text/html').send(
      consentHtml({
        lang,
        redirectUri: params.redirect_uri,
        clientId: params.client_id,
        clientName: client?.clientName,
        account: user?.email,
        state: params.state,
        codeChallenge: params.code_challenge,
        scope,
        ...(params.device ? { device: params.device } : {}),
        consentToken: consentToken({
          uid,
          clientId: params.client_id,
          codeChallenge: params.code_challenge,
          secret: sessionSecret,
        }),
      }),
    );
  });

  app.post('/oauth/authorize', async (request, reply) => {
    const uid = activeSessionUid(request);
    if (!uid) {
      return reply.status(401).send({ error: 'login_required' });
    }

    const validated = await validateAuthorizeParams(request, uid);
    if (!validated.ok) {
      return reply.status(validated.status).send({ error: validated.error });
    }

    const { params, scope } = validated;

    // A grant is durable write access to someone's games, and `sameSite: 'lax'` does not
    // stop a top-level cross-site form POST — so without this the screen above could be
    // skipped entirely. Checked before the action is even read.
    const submittedToken =
      typeof (request.body as { consent_token?: string }).consent_token === 'string'
        ? (request.body as { consent_token: string }).consent_token
        : '';
    // Both secrets, exactly as the session cookie is read. A rotation between the GET
    // that issued the token and the POST that spends it leaves the session valid — it
    // verifies against `sessionSecretPrev` — so rejecting the token would 403 a creator
    // who did nothing wrong, on the one screen where a refusal looks like a break-in.
    const acceptedSecrets = sessionSecretPrev ? [sessionSecret, sessionSecretPrev] : [sessionSecret];
    const tokenAccepted = acceptedSecrets.some((secret) =>
      consentTokenValid(
        submittedToken,
        consentToken({ uid, clientId: params.client_id, codeChallenge: params.code_challenge, secret }),
      ),
    );
    if (!tokenAccepted) {
      return reply.status(403).send({ error: 'invalid_consent' });
    }

    const action =
      typeof (request.body as { action?: string }).action === 'string'
        ? (request.body as { action: string }).action
        : 'deny';

    if (action !== 'approve') {
      return reply.redirect(oauthErrorRedirect(params.redirect_uri, 'access_denied', params.state));
    }

    const nowMs = now();
    const held = await store.listOAuthGrantsByOwner(uid);
    const reused = held.find((grant) => sameCliDeviceGrant(grant, params.client_id, params.device));
    if (!reused && held.length >= MAX_OAUTH_GRANTS_PER_UID) {
      return reply.redirect(
        oauthErrorRedirect(params.redirect_uri, 'access_denied', params.state, OAUTH_GRANT_CAP_DESCRIPTION),
      );
    }

    const authCode = generateAsAuthCode();
    await store.createOAuthAuthCode({
      codeId: authCode.codeId,
      codeHash: authCode.codeHash,
      clientId: params.client_id,
      ownerUid: uid,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: 'S256',
      scope,
      expiresAt: new Date(nowMs + AS_AUTH_CODE_TTL_MS).toISOString(),
      grantId: reused?.grantId ?? randomUUID(),
      ...(isGamedevCliClient(params.client_id) ? { deviceName: sanitizeDeviceName(params.device) } : {}),
    });

    return reply.redirect(oauthCodeRedirect(params.redirect_uri, authCode.code, params.state));
  });

  app.post('/oauth/token', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'invalid_request' });
    }
    const nowMs = now();
    if (isRateLimited(tokenHitsByIp, request.clientIp, nowMs, TOKEN_RATE_LIMIT_MAX, TOKEN_RATE_LIMIT_WINDOW_MS)) {
      return reply.status(429).send({ error: 'too_many_requests' });
    }
    const grantType =
      typeof (body as { grant_type?: string }).grant_type === 'string'
        ? (body as { grant_type: string }).grant_type
        : '';

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

      const grantId = consumed.grantId ?? randomUUID();
      let grant = consumed.grantId ? await store.getOAuthGrant(consumed.grantId) : null;
      if (!grant) {
        const created = await store.createOAuthGrant(
          {
            grantId,
            clientId: consumed.clientId,
            ownerUid: consumed.ownerUid,
            scope: consumed.scope,
            createdAt: new Date(nowMs).toISOString(),
            refreshFamilyId: grantId,
            currentRefreshTokenId: '',
            currentRefreshHash: '',
            refreshExpiresAt: new Date(nowMs + AS_REFRESH_TOKEN_TTL_MS).toISOString(),
            ...(consumed.deviceName ? { deviceName: consumed.deviceName } : {}),
          },
          { maxPerOwner: MAX_OAUTH_GRANTS_PER_UID },
        );
        if (!created) return reply.status(400).send({ error: 'access_denied' });
        grant = await store.getOAuthGrant(grantId);
      }
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
        scope: consumed.scope,
      });
      if (!issued) return reply.status(400).send({ error: 'invalid_grant' });

      return reply.send({
        access_token: access.token,
        refresh_token: refresh.token,
        expires_in: Math.floor(AS_ACCESS_TOKEN_TTL_MS / 1000),
        token_type: 'Bearer',
        scope: issued.scope,
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
        // Refresh-token reuse revokes the whole grant in the store. Session keys minted
        // before that revocation do not consult the grant, so advance the creator's open
        // self rounds as well or the stolen capability would remain writable for 24h.
        if (rotateResult.reason === 'reuse' && scopeHasMcp(grant.scope)) {
          await endOpenAgentSessions(store, grant.ownerUid);
        }
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

    if (grantType === DEVICE_GRANT_TYPE) {
      const deviceCode =
        typeof (body as { device_code?: string }).device_code === 'string'
          ? (body as { device_code: string }).device_code.trim()
          : '';
      const clientId =
        typeof (body as { client_id?: string }).client_id === 'string'
          ? (body as { client_id: string }).client_id.trim()
          : '';
      const exchanged = await exchangeDeviceCode(store, { deviceCode, clientId, nowMs });
      if (!exchanged.ok) {
        return reply.status(exchanged.status).send({ error: exchanged.error });
      }
      return reply.send({
        access_token: exchanged.accessToken,
        refresh_token: exchanged.refreshToken,
        expires_in: Math.floor(AS_ACCESS_TOKEN_TTL_MS / 1000),
        token_type: 'Bearer',
        scope: exchanged.scope,
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
        const access = await store.getAsAccessToken(parsed.tokenId);
        grantId = access?.grantId ?? null;
      } catch {
        grantId = null;
      }
    }

    if (grantId) {
      const grant = await store.getOAuthGrant(grantId);
      // RFC 7009 revocation is idempotent. Do not let someone holding an already-revoked
      // token repeatedly advance every self round as a denial-of-service primitive.
      if (grant && !grant.revokedAt) {
        const revoked = await store.revokeOAuthGrant(grantId, grant.ownerUid);
        if (revoked && scopeHasMcp(grant.scope)) await endOpenAgentSessions(store, grant.ownerUid);
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
        const client = await resolveOAuthClient(store, grant.clientId, now(), cimdFetcher, { network: false });
        const redirectHost = client?.redirectUris[0];
        return {
          grantId: grant.grantId,
          clientId: grant.clientId,
          clientLabel: client
            ? clientLabel(client, grant, redirectHost)
            : grant.clientId.startsWith('https://') && validateCimdUrl(grant.clientId)
              ? new URL(grant.clientId).host
              : grant.clientId,
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
    const existing = await store.getOAuthGrant(grantId);
    const revoked = await store.revokeOAuthGrant(grantId, uid);
    if (!revoked) return reply.status(404).send({ error: 'not_found' });
    if (existing && scopeHasMcp(existing.scope)) {
      await endOpenAgentSessions(store, uid);
    }
    return reply.status(204).send();
  });
}
