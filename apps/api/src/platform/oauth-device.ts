import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { cliSurfaceEnabled } from './cli-surface.js';
import { escapeHtml, MASCOT_SVG, OAUTH_PAGE_STYLES } from './oauth-page-chrome.js';
import { consentToken, consentTokenValid, copyForScope } from './oauth-consent.js';
import { bindingFields, consentIdentity, tokenBindingLive } from './pat-grant-binding.js';
import type { OAuthDeviceAuthorization } from '../store/records/oauth-device.js';
import { isGamedevCliClient, sanitizeDeviceName, GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';
import { CREATOR_SCOPE, formatOAuthScope, MAX_OAUTH_GRANTS_PER_UID, parseOAuthScopes } from './oauth-scopes.js';
import {
  AS_REFRESH_TOKEN_TTL_MS,
  buildAsAccessTokenRecord,
  generateAsAccessToken,
  generateAsRefreshToken,
} from './oauth-tokens.js';
import type { OAuthGrantRecord, Store } from './store.js';

export const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
export const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
export const DEVICE_POLL_INTERVAL_SEC = 5;
export const MAX_PENDING_DEVICE_CODES = 64;

const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const deviceRequestSchema = z.object({
  client_id: z.string().max(128).optional(),
  scope: z.string().max(128).optional(),
  device: z.string().max(256).optional(),
});

function hashDeviceCode(deviceCode: string): string {
  return createHash('sha256').update(deviceCode).digest('hex');
}

function mintUserCode(): string {
  const n = USER_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < 8) {
    for (const byte of randomBytes(8)) {
      if (byte >= limit) continue;
      out += USER_CODE_ALPHABET[byte % n];
      if (out.length === 8) break;
    }
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function deviceConsent(uid: string, secret: string): string {
  return consentToken({ uid, clientId: GAMEDEV_CLI_CLIENT_ID, codeChallenge: 'device', secret });
}

function devicePage(input: {
  userCode: string;
  consentToken: string;
  error?: string;
  scope?: string;
  deviceName?: string;
}): string {
  const error = input.error ? `<p class="hint">${escapeHtml(input.error)}</p>` : '';
  const copy = input.scope ? copyForScope('en', 'gamedevpl CLI', input.scope) : null;
  const list = (items: string[]) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const permissions = copy
    ? `<p class="lead">${escapeHtml(copy.lead)}</p>
    <h2>${escapeHtml(copy.canTitle)}</h2>
    <ul class="can">${list(copy.can)}</ul>
    <h2>${escapeHtml(copy.cannotTitle)}</h2>
    <ul class="cannot">${list(copy.cannot)}</ul>`
    : '<p class="lead">Enter the code shown in your terminal.</p>';
  const disclosed = input.scope
    ? `<input type="hidden" name="disclosed_scope" value="${escapeHtml(input.scope)}" />`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>gamedevpl CLI device login</title>
  ${OAUTH_PAGE_STYLES}
</head>
<body>
  <main>
    <p class="brand">${MASCOT_SVG}<span>gamedev.pl</span></p>
    <h1>Approve gamedevpl CLI</h1>
    ${input.deviceName ? `<p class="lead">Device: <strong>${escapeHtml(input.deviceName)}</strong></p><p class="hint">Check that this code matches your terminal and this is the device you want to connect.</p>` : ''}
    ${permissions}
    ${error}
    <form method="post" action="/device">
      <input type="hidden" name="consent_token" value="${escapeHtml(input.consentToken)}" />
      ${disclosed}
      <label>Code <input type="text" name="user_code" value="${escapeHtml(input.userCode)}" autocomplete="off" /></label>
      <div class="actions">
        <button type="submit" name="action" value="approve" class="approve">Approve</button>
        <button type="submit" name="action" value="deny">Deny</button>
      </div>
    </form>
  </main>
</body>
</html>`;
}

export function registerOAuthDeviceRoutes(
  app: FastifyInstance,
  options: { store: Store; sessionSecret: string; now?: () => number },
): void {
  const store = options.store;
  const now = options.now ?? Date.now;
  const sessionSecret = options.sessionSecret;

  app.post(
    '/oauth/device',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      if (!cliSurfaceEnabled()) {
        return reply.status(404).send({ error: 'not found' });
      }
      const parsed = deviceRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: 'invalid_request' });
      const body = parsed.data;
      const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
      if (!isGamedevCliClient(clientId)) {
        return reply.status(400).send({ error: 'invalid_client' });
      }
      const scopes = parseOAuthScopes(body.scope ?? CREATOR_SCOPE);
      if (!scopes || !scopes.includes(CREATOR_SCOPE)) {
        return reply.status(400).send({ error: 'invalid_scope' });
      }
      const nowMs = now();
      const deviceCode = randomBytes(32).toString('base64url');
      let userCode = mintUserCode();
      const row: OAuthDeviceAuthorization = {
        deviceCodeHash: hashDeviceCode(deviceCode),
        userCode,
        clientId,
        scope: formatOAuthScope(scopes),
        deviceName: sanitizeDeviceName(body.device),
        expiresAtMs: nowMs + DEVICE_CODE_TTL_MS,
        intervalSec: DEVICE_POLL_INTERVAL_SEC,
      };
      let created = await store.createOAuthDeviceAuthorization(row, nowMs, MAX_PENDING_DEVICE_CODES);
      for (let retry = 0; created === 'collision' && retry < 5; retry++) {
        userCode = mintUserCode();
        created = await store.createOAuthDeviceAuthorization({ ...row, userCode }, nowMs, MAX_PENDING_DEVICE_CODES);
      }
      if (created !== 'created') return reply.status(429).send({ error: 'too_many_requests' });
      const base = canonicalAppBaseUrl();
      return reply.status(200).send({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${base}/device`,
        verification_uri_complete: `${base}/device?user_code=${encodeURIComponent(userCode)}`,
        expires_in: Math.floor(DEVICE_CODE_TTL_MS / 1000),
        interval: DEVICE_POLL_INTERVAL_SEC,
      });
    },
  );

  app.get('/device', async (request, reply) => {
    if (!cliSurfaceEnabled()) return reply.status(404).send({ error: 'not found' });
    const uid = (await consentIdentity(request, store, now()))?.uid;
    if (!uid) {
      return reply.redirect(`${canonicalAppBaseUrl()}/studio?oauth_return=${encodeURIComponent(request.url)}`);
    }
    const userCode =
      typeof (request.query as { user_code?: string }).user_code === 'string'
        ? (request.query as { user_code: string }).user_code.trim().toUpperCase()
        : '';
    const row = userCode ? await store.getOAuthDeviceAuthorization(userCode, now()) : null;
    return reply.type('text/html').send(
      devicePage({
        userCode,
        consentToken: deviceConsent(uid, sessionSecret),
        scope: row?.scope,
        deviceName: row?.deviceName,
      }),
    );
  });

  app.post('/device', async (request, reply) => {
    if (!cliSurfaceEnabled()) return reply.status(404).send({ error: 'not found' });
    const identity = await consentIdentity(request, store, now());
    if (!identity) {
      return reply.redirect(`${canonicalAppBaseUrl()}/studio?oauth_return=/device`);
    }
    const uid = identity.uid;
    const expected = deviceConsent(uid, sessionSecret);
    const body = (request.body ?? {}) as {
      user_code?: string;
      action?: string;
      consent_token?: string;
      disclosed_scope?: string;
    };
    const userCode = typeof body.user_code === 'string' ? body.user_code.trim().toUpperCase() : '';
    const page = (error?: string, code = userCode, scope?: string, deviceName?: string) =>
      reply.type('text/html').send(devicePage({ userCode: code, consentToken: expected, error, scope, deviceName }));
    if (!consentTokenValid(typeof body.consent_token === 'string' ? body.consent_token : '', expected)) {
      return page('Refresh this page and try again.');
    }
    const row = await store.getOAuthDeviceAuthorization(userCode, now());
    if (!row) {
      return page('That code is unknown or expired.');
    }
    if (body.action === 'deny') {
      if (!(await store.decideOAuthDeviceAuthorization(userCode, { denied: true }, now())))
        return page('That code is already decided or expired.');
      return page('Denied. You can close this page.', '', row.scope);
    }
    if (body.action !== 'approve') {
      return page('Choose Approve or Deny to continue.', userCode, row.scope, row.deviceName);
    }
    if (body.disclosed_scope !== row.scope) {
      return page('Review the permissions below, then approve.', userCode, row.scope, row.deviceName);
    }
    if (!(await store.decideOAuthDeviceAuthorization(userCode, { ownerUid: uid, ...bindingFields(identity) }, now())))
      return page('That code is already decided or expired.');
    return page('Approved. Return to your terminal.', '', row.scope);
  });
}

export async function exchangeDeviceCode(
  store: Store,
  input: { deviceCode: string; clientId: string; nowMs: number },
): Promise<
  { ok: true; accessToken: string; refreshToken: string; scope: string } | { ok: false; error: string; status: number }
> {
  if (!cliSurfaceEnabled()) return { ok: false, error: 'invalid_grant', status: 400 };
  if (!isGamedevCliClient(input.clientId)) return { ok: false, error: 'invalid_client', status: 400 };
  const hash = hashDeviceCode(input.deviceCode);
  const polled = await store.pollOAuthDeviceAuthorization(hash, input.clientId, input.nowMs);
  if (!polled.ok) return { ...polled, status: 400 };
  const row = polled.authorization;
  const binding = { ownerUid: row.ownerUid!, ...bindingFields(row) };
  if (!(await tokenBindingLive(store, binding, input.nowMs))) {
    return { ok: false, error: 'access_denied', status: 400 };
  }

  const grantId = randomUUID();
  const grant: OAuthGrantRecord = {
    grantId,
    clientId: row.clientId,
    ownerUid: row.ownerUid!,
    scope: row.scope,
    createdAt: new Date(input.nowMs).toISOString(),
    refreshFamilyId: grantId,
    currentRefreshTokenId: '',
    currentRefreshHash: '',
    refreshExpiresAt: new Date(input.nowMs + AS_REFRESH_TOKEN_TTL_MS).toISOString(),
    deviceName: row.deviceName,
    ...bindingFields(row),
  };
  const created = await store.createOAuthGrant(grant, { maxPerOwner: MAX_OAUTH_GRANTS_PER_UID });
  if (!created) {
    return { ok: false, error: 'access_denied', status: 400 };
  }
  const access = generateAsAccessToken();
  const refresh = generateAsRefreshToken();
  const issued = await store.issueOAuthTokensFromGrant({
    grantId,
    refreshTokenId: refresh.tokenId,
    refreshHash: refresh.secretHash,
    refreshExpiresAt: new Date(input.nowMs + AS_REFRESH_TOKEN_TTL_MS).toISOString(),
    accessToken: buildAsAccessTokenRecord(access, grant, input.nowMs),
    nowMs: input.nowMs,
  });
  if (!issued) return { ok: false, error: 'invalid_grant', status: 400 };
  return { ok: true, accessToken: access.token, refreshToken: refresh.token, scope: row.scope };
}
