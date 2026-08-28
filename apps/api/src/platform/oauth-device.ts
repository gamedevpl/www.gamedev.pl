import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { InvalidSessionError, readSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { cliSurfaceEnabled } from './cli-surface.js';
import { escapeHtml, MASCOT_SVG, OAUTH_PAGE_STYLES } from './oauth-page-chrome.js';
import { isGamedevCliClient, sanitizeDeviceName } from './oauth-first-party.js';
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

type DeviceAuth = {
  deviceCodeHash: string;
  userCode: string;
  clientId: string;
  scope: string;
  deviceName: string;
  expiresAt: number;
  intervalSec: number;
  lastPollAt: number;
  uid?: string;
  denied?: boolean;
  consumed?: boolean;
};

const pending = new Map<string, DeviceAuth>();

function hashDeviceCode(deviceCode: string): string {
  return createHash('sha256').update(deviceCode).digest('hex');
}

function mintUserCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += USER_CODE_ALPHABET[bytes[i]! % USER_CODE_ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function prune(nowMs: number): void {
  for (const [key, row] of pending) {
    if (row.expiresAt <= nowMs || row.consumed) pending.delete(key);
  }
}

function readUid(request: FastifyRequest, sessionSecret: string, sessionSecretPrev?: string): string | null {
  const cookie = request.cookies[SESSION_COOKIE_NAME];
  if (!cookie || typeof cookie !== 'string') return null;
  try {
    return readSessionToken(cookie, sessionSecret, sessionSecretPrev).uid;
  } catch (error) {
    if (error instanceof InvalidSessionError) return null;
    throw error;
  }
}

function devicePage(input: { userCode: string; error?: string }): string {
  const error = input.error ? `<p class="hint">${escapeHtml(input.error)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>gamedev CLI device login</title>
  ${OAUTH_PAGE_STYLES}
</head>
<body>
  <main>
    <p class="brand">${MASCOT_SVG}<span>gamedev.pl</span></p>
    <h1>Approve gamedev CLI</h1>
    <p class="lead">Enter the code shown in your terminal.</p>
    ${error}
    <form method="post" action="/device">
      <label>Code <input name="user_code" value="${escapeHtml(input.userCode)}" autocomplete="off" /></label>
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
  options: { sessionSecret: string; sessionSecretPrev?: string; now?: () => number },
): void {
  const now = options.now ?? Date.now;
  const sessionSecret = options.sessionSecret;
  const sessionSecretPrev = options.sessionSecretPrev;

  app.post(
    '/oauth/device',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      if (!cliSurfaceEnabled()) {
        return reply.status(404).send({ error: 'not found' });
      }
      const body = (request.body ?? {}) as { client_id?: string; scope?: string; device?: string };
      const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
      if (!isGamedevCliClient(clientId)) {
        return reply.status(400).send({ error: 'invalid_client' });
      }
      const scopes = parseOAuthScopes(body.scope ?? CREATOR_SCOPE);
      if (!scopes || !scopes.includes(CREATOR_SCOPE)) {
        return reply.status(400).send({ error: 'invalid_scope' });
      }
      const nowMs = now();
      prune(nowMs);
      if (pending.size >= MAX_PENDING_DEVICE_CODES) {
        return reply.status(429).send({ error: 'too_many_requests' });
      }
      const deviceCode = randomBytes(32).toString('base64url');
      const userCode = mintUserCode();
      const row: DeviceAuth = {
        deviceCodeHash: hashDeviceCode(deviceCode),
        userCode,
        clientId,
        scope: formatOAuthScope(scopes),
        deviceName: sanitizeDeviceName(body.device),
        expiresAt: nowMs + DEVICE_CODE_TTL_MS,
        intervalSec: DEVICE_POLL_INTERVAL_SEC,
        lastPollAt: 0,
      };
      pending.set(userCode, row);
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
    const uid = readUid(request, sessionSecret, sessionSecretPrev);
    if (!uid) {
      return reply.redirect(`${canonicalAppBaseUrl()}/studio?oauth_return=${encodeURIComponent(request.url)}`);
    }
    const userCode =
      typeof (request.query as { user_code?: string }).user_code === 'string'
        ? (request.query as { user_code: string }).user_code.trim().toUpperCase()
        : '';
    return reply.type('text/html').send(devicePage({ userCode }));
  });

  app.post('/device', async (request, reply) => {
    if (!cliSurfaceEnabled()) return reply.status(404).send({ error: 'not found' });
    const uid = readUid(request, sessionSecret, sessionSecretPrev);
    if (!uid) {
      return reply.redirect(`${canonicalAppBaseUrl()}/studio?oauth_return=/device`);
    }
    const body = (request.body ?? {}) as { user_code?: string; action?: string };
    const userCode = typeof body.user_code === 'string' ? body.user_code.trim().toUpperCase() : '';
    const row = pending.get(userCode);
    if (!row || row.expiresAt <= now()) {
      return reply.type('text/html').send(devicePage({ userCode, error: 'That code is unknown or expired.' }));
    }
    if (body.action === 'deny') {
      row.denied = true;
      return reply.type('text/html').send(devicePage({ userCode: '', error: 'Denied. You can close this page.' }));
    }
    row.uid = uid;
    return reply.type('text/html').send(devicePage({ userCode: '', error: 'Approved. Return to your terminal.' }));
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
  const row = [...pending.values()].find((item) => item.deviceCodeHash === hash);
  prune(input.nowMs);
  if (!row) return { ok: false, error: 'invalid_grant', status: 400 };
  if (row.expiresAt <= input.nowMs) {
    pending.delete(row.userCode);
    return { ok: false, error: 'expired_token', status: 400 };
  }
  const minInterval = row.intervalSec * 1000;
  if (input.nowMs - row.lastPollAt < minInterval) {
    row.intervalSec += 5;
    return { ok: false, error: 'slow_down', status: 400 };
  }
  row.lastPollAt = input.nowMs;
  if (row.denied) {
    pending.delete(row.userCode);
    return { ok: false, error: 'access_denied', status: 400 };
  }
  if (!row.uid) return { ok: false, error: 'authorization_pending', status: 400 };

  const held = await store.listOAuthGrantsByOwner(row.uid);
  if (held.length >= MAX_OAUTH_GRANTS_PER_UID) {
    pending.delete(row.userCode);
    return { ok: false, error: 'access_denied', status: 400 };
  }

  const grantId = randomUUID();
  const grant: OAuthGrantRecord = {
    grantId,
    clientId: row.clientId,
    ownerUid: row.uid,
    scope: row.scope,
    createdAt: new Date(input.nowMs).toISOString(),
    refreshFamilyId: grantId,
    currentRefreshTokenId: '',
    currentRefreshHash: '',
    refreshExpiresAt: new Date(input.nowMs + AS_REFRESH_TOKEN_TTL_MS).toISOString(),
    deviceName: row.deviceName,
  };
  await store.createOAuthGrant(grant);
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
  pending.delete(row.userCode);
  if (!issued) return { ok: false, error: 'invalid_grant', status: 400 };
  return { ok: true, accessToken: access.token, refreshToken: refresh.token, scope: row.scope };
}
