import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Locale } from '@gamedevpl/contract';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { endOpenAgentSessions } from './agent-session-revocation.js';
import { InvalidSessionError, readSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { escapeHtml, MASCOT_SVG, OAUTH_PAGE_STYLES } from './oauth-page-chrome.js';
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

interface CimdDocument {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  // RP Metadata Choices: methods ChatGPT can actually use.
  token_endpoint_auth_methods_supported?: string[];
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
  if (!cimdSupportsPublicClientAuth(body)) return null;

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

/**
 * Days of inactivity after which a grant dies on its own.
 *
 * Derived, not typed as a number: the consent screen states this as a promise, and a
 * promise that drifts from the constant enforcing it is the defect this whole screen
 * exists to stop making.
 */
const INACTIVITY_DAYS = Math.round(AS_REFRESH_TOKEN_TTL_MS / (24 * 60 * 60 * 1000));

/**
 * Binds the consent form to the session that was shown it.
 *
 * `POST /oauth/authorize` mints a real, durable grant, and its only protection was the
 * session cookie's `sameSite: 'lax'` — which does not cover a top-level form POST from
 * another origin. That is the one request on this server where a cross-site submit is
 * worth mounting: it hands a coding agent standing write access to someone's games
 * without the consent screen ever rendering.
 *
 * Stateless on purpose: the HMAC covers the uid together with the exact request being
 * consented to, so a token cannot be lifted from one creator's form onto another's, nor
 * replayed against a different client or PKCE challenge.
 */
export function consentToken(input: { uid: string; clientId: string; codeChallenge: string; secret: string }): string {
  return createHmac('sha256', input.secret)
    .update(`oauth-consent-v1:${input.uid}:${input.clientId}:${input.codeChallenge}`)
    .digest('hex');
}

function consentTokenValid(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function consentHtml(input: {
  lang: Locale;
  redirectUri: string;
  clientId: string;
  clientName?: string;
  account?: string;
  state?: string;
  codeChallenge: string;
  scope: string;
  consentToken: string;
}): string {
  // Falls back to the client_id when a client registered without a name. Better a URL
  // the creator can read than "a coding agent", which every client would say.
  const client = input.clientName?.trim() || input.clientId;
  const copy =
    input.lang === 'pl'
      ? {
          title: `Połącz ${client}`,
          lead: `${client} prosi o budowanie gier na Twoim koncie.`,
          as: 'Zatwierdzasz jako',
          canTitle: 'Będzie mógł',
          can: [
            'Rozpoczynać i kontynuować rundy budowania Twoich gier',
            'Zużywać Twój dzienny limit poprawek',
            'Czytać i zastępować źródła Twoich gier',
            'Publikować nowe wersje w arcade',
          ],
          cannotTitle: 'Nie będzie mógł',
          cannot: ['Dotykać gier, których nie jesteś właścicielem', 'Zmieniać Twojego konta ani logowania'],
          redirect: 'Wrócisz na',
          redirectHint: 'To powinien być agent, którego przed chwilą użyłeś. Jeśli go nie rozpoznajesz — odmów.',
          duration: `Dostęp trwa, dopóki go nie cofniesz w Studio — albo dopóki agent nie połączy się przez ${INACTIVITY_DAYS} dni.`,
          approve: 'Zatwierdź',
          deny: 'Odmów',
          bail: 'Nie łączyłeś przed chwilą agenta? Naciśnij Odmów — nic nie zostanie udostępnione.',
        }
      : {
          title: `Connect ${client}`,
          lead: `${client} is asking to build games on your account.`,
          as: 'Granting as',
          canTitle: 'It will be able to',
          can: [
            'Start and continue build rounds on games you own',
            'Use your daily improvement rounds',
            'Read and replace the sources of your games',
            'Publish new versions to the arcade',
          ],
          cannotTitle: 'It will not be able to',
          cannot: ['Touch games you do not own', 'Change your account or how you sign in'],
          redirect: "You'll be sent back to",
          redirectHint: 'This should be the agent you just used. If you do not recognise it, deny.',
          duration: `Access lasts until you revoke it in Studio, or until the agent goes ${INACTIVITY_DAYS} days without connecting.`,
          approve: 'Approve',
          deny: 'Deny',
          bail: 'Did not just connect an agent? Press Deny — nothing is shared unless you approve.',
        };

  const hidden = [
    `<input type="hidden" name="client_id" value="${escapeHtml(input.clientId)}" />`,
    `<input type="hidden" name="redirect_uri" value="${escapeHtml(input.redirectUri)}" />`,
    input.state ? `<input type="hidden" name="state" value="${escapeHtml(input.state)}" />` : '',
    `<input type="hidden" name="code_challenge" value="${escapeHtml(input.codeChallenge)}" />`,
    `<input type="hidden" name="code_challenge_method" value="S256" />`,
    `<input type="hidden" name="scope" value="${escapeHtml(input.scope)}" />`,
    `<input type="hidden" name="response_type" value="code" />`,
    `<input type="hidden" name="consent_token" value="${escapeHtml(input.consentToken)}" />`,
  ].join('\n');

  const list = (items: string[]) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n      ');

  return `<!doctype html>
<html lang="${input.lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(copy.title)}</title>
  ${OAUTH_PAGE_STYLES}
</head>
<body>
  <main>
    <p class="brand">${MASCOT_SVG}<span>gamedev.pl</span></p>
    <h1>${escapeHtml(copy.title)}</h1>
    <p class="lead">${escapeHtml(copy.lead)}</p>
    ${input.account ? `<p class="who">${escapeHtml(copy.as)} <strong>${escapeHtml(input.account)}</strong></p>` : ''}

    <h2>${escapeHtml(copy.canTitle)}</h2>
    <ul class="can">
      ${list(copy.can)}
    </ul>

    <h2>${escapeHtml(copy.cannotTitle)}</h2>
    <ul class="cannot">
      ${list(copy.cannot)}
    </ul>

    <h2>${escapeHtml(copy.redirect)}</h2>
    <p class="redirect">${escapeHtml(input.redirectUri)}</p>
    <p class="hint">${escapeHtml(copy.redirectHint)}</p>

    <p class="duration">${escapeHtml(copy.duration)}</p>

    <form method="post" action="/oauth/authorize">
      ${hidden}
      <div class="actions">
        <button type="submit" name="action" value="approve" class="approve">${escapeHtml(copy.approve)}</button>
        <button type="submit" name="action" value="deny">${escapeHtml(copy.deny)}</button>
      </div>
    </form>

    <p class="bail">${escapeHtml(copy.bail)}</p>
  </main>
</body>
</html>`;
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

    const { params, client } = validated;
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
        scope: params.scope ?? MCP_SCOPE,
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
    const uid = readUidFromSession(request, sessionSecret, sessionSecretPrev);
    if (!uid) {
      return reply.status(401).send({ error: 'login_required' });
    }

    const validated = await validateAuthorizeParams(request);
    if (!validated.ok) {
      return reply.status(validated.status).send({ error: validated.error });
    }

    const { params } = validated;

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
        // Refresh-token reuse revokes the whole grant in the store. Session keys minted
        // before that revocation do not consult the grant, so advance the creator's open
        // self rounds as well or the stolen capability would remain writable for 24h.
        if (rotateResult.reason === 'reuse') {
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
      // RFC 7009 revocation is idempotent. Do not let someone holding an already-revoked
      // token repeatedly advance every self round as a denial-of-service primitive.
      if (grant && !grant.revokedAt) {
        const revoked = await store.revokeOAuthGrant(grantId, grant.ownerUid);
        if (revoked) await endOpenAgentSessions(store, grant.ownerUid);
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
    // OAuth access is only checked by start(). The returned sessionKey is bound to the
    // round generation, so revoking the grant must advance that generation just like a
    // creator-key rotation/revoke does. This makes "disconnect immediately" truthful.
    await endOpenAgentSessions(store, uid);
    return reply.status(204).send();
  });
}
