import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { resolveAccessTokenUser } from './access-token-service.js';
import { DEFAULT_SESSION_DURATION_SECONDS, mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { escapeHtml, MASCOT_SVG, OAUTH_PAGE_STYLES } from './oauth-page-chrome.js';
import type { Store } from './store.js';

export const TOKEN_LOGIN_PATH = '/oauth/token-login';

/**
 * How long a rendered form stays submittable. Stateless: the token is an HMAC over a
 * time bucket, so accepting the current and previous bucket gives every visitor at
 * least this long and at most twice it, with nothing to store or expire.
 */
const FORM_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface TokenLoginOptions {
  store: Store;
  sessionSecret: string;
  now?: () => number;
}

/**
 * True when `path` is a relative authorize URL we may navigate to after sign-in.
 *
 * Mirrors sanitizeOAuthReturnPath in apps/web/src/oauthReturn.ts, which does this for
 * the Google/Apple path. Kept as a separate copy rather than shared because the two live
 * in different workspaces with no common package, and the alternative — importing across
 * apps — is the thing the import rule exists to prevent. Any change here belongs there
 * too: both answer "may we redirect a just-authenticated browser at this?", and an open
 * redirect at that exact moment is a phishing page wearing our session.
 */
export function sanitizeOAuthReturnPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/oauth/authorize')) return null;
  if (trimmed.startsWith('//') || trimmed.includes('\\') || /[\r\n]/.test(trimmed)) return null;
  if (trimmed.includes('://')) return null;
  if (trimmed !== '/oauth/authorize' && !trimmed.startsWith('/oauth/authorize?')) return null;
  return trimmed;
}

export function formToken(secret: string, nowMs: number, bucketOffset = 0): string {
  const bucket = Math.floor(nowMs / FORM_TOKEN_TTL_MS) - bucketOffset;
  return createHmac('sha256', secret).update(`oauth-token-login-v1:${bucket}`).digest('hex');
}

function formTokenValid(candidate: string, secret: string, nowMs: number): boolean {
  // Current and previous bucket, so a form rendered at 10:59 still submits at 11:01.
  return [0, 1].some((offset) => {
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(formToken(secret, nowMs, offset), 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * English only, unlike the consent screen beside it.
 *
 * The consent screen is shown to creators, who arrive in whatever language they use the
 * site in. This one is shown to whoever was handed a token out of band — an operator or
 * a marketplace reviewer — and translating a page nobody reaches by accident would be
 * inventing an audience it does not have.
 */
function tokenLoginHtml(input: { oauthReturn: string | null; formToken: string; error?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Sign in with an access token · gamedev.pl</title>
  ${OAUTH_PAGE_STYLES}
</head>
<body>
  <main>
    <p class="brand">${MASCOT_SVG}<span>gamedev.pl</span></p>
    <h1>Sign in with an access token</h1>
    <p class="lead">
      Paste the personal access token you were given. It signs you in as the account the
      token belongs to, for ${DEFAULT_SESSION_DURATION_SECONDS / 3600} hours.
    </p>
    ${input.error ? `<p class="waiting">${escapeHtml(input.error)}</p>` : ''}

    <form method="post" action="${TOKEN_LOGIN_PATH}">
      <input type="hidden" name="form_token" value="${escapeHtml(input.formToken)}" />
      ${input.oauthReturn ? `<input type="hidden" name="oauth_return" value="${escapeHtml(input.oauthReturn)}" />` : ''}
      <label for="token">Access token</label>
      <input
        type="password"
        id="token"
        name="token"
        autocomplete="current-password"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="gdpl_pat_…"
        required
      />
      <div class="actions">
        <button type="submit" class="approve">Sign in</button>
      </div>
    </form>

    <p class="bail">
      This page is for accounts that sign in with a token rather than Google or Apple.
      If you have a gamedev.pl account, use the sign-in button on the site instead.
    </p>
  </main>
</body>
</html>`;
}

/**
 * Sign in with a personal access token, in a browser (docs/agent-access-tokens.md).
 *
 * `POST /api/auth/session` already trades a PAT for a session cookie, and that is the
 * mechanism here — this page adds no authority, and is emphatically not the bypass route
 * AGENTS.md promises does not exist. What it adds is a way to *perform* that exchange
 * without a shell: the API route wants an `Authorization` header, and a human sitting in
 * front of a browser cannot produce one. That gap matters because sign-in on this site
 * is Google or Apple and nothing else, so anyone who must reach the consent screen
 * without a Google account — a marketplace reviewer testing the MCP connector, most
 * immediately — has no door at all.
 *
 * Deliberately not linked from anywhere. It is not a second front door for creators;
 * it is the door for whoever was handed a token, and a token can only exist because an
 * operator minted one. That is what stands in for registration: there is no signup here
 * because there is no way to acquire the credential except by being given it.
 */
export function registerTokenLoginRoutes(app: FastifyInstance, options: TokenLoginOptions): void {
  const { store, sessionSecret } = options;
  const now = options.now ?? (() => Date.now());
  const isProd = process.env.NODE_ENV === 'production';

  // Same guarded registration as oauth-as.ts: in app.ts that module has already claimed
  // the parser, but this one has to stand alone when a test mounts only these routes.
  if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      const params = new URLSearchParams(body as string);
      const parsed: Record<string, string> = {};
      for (const [key, value] of params) parsed[key] = value;
      done(null, parsed);
    });
  }

  app.get(TOKEN_LOGIN_PATH, async (request, reply) => {
    const raw = (request.query as { oauth_return?: string }).oauth_return;
    return reply
      .type('text/html')
      .header('cache-control', 'no-store')
      .send(
        tokenLoginHtml({
          oauthReturn: typeof raw === 'string' ? sanitizeOAuthReturnPath(raw) : null,
          formToken: formToken(sessionSecret, now()),
        }),
      );
  });

  app.post(
    TOKEN_LOGIN_PATH,
    // Per-IP, because the token is the only thing guarding the account behind it and a
    // form is far easier to grind than a curl loop. The window matches /api/auth/*.
    { config: { rateLimit: { max: 20, timeWindow: 60 * 60 * 1000 } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as { token?: string; oauth_return?: string; form_token?: string };
      const oauthReturn = typeof body.oauth_return === 'string' ? sanitizeOAuthReturnPath(body.oauth_return) : null;
      const nowMs = now();

      const fail = (status: number, error: string) =>
        reply
          .status(status)
          .type('text/html')
          .header('cache-control', 'no-store')
          .send(tokenLoginHtml({ oauthReturn, formToken: formToken(sessionSecret, nowMs), error }));

      // Login CSRF: `sameSite: 'lax'` does not stop a top-level cross-site form POST, so
      // without this an attacker could silently sign a visitor's browser into an account
      // the attacker controls — and the next thing this flow does is ask that browser to
      // approve durable write access. Proving the POST came from a form we served is
      // cheap and closes it.
      if (typeof body.form_token !== 'string' || !formTokenValid(body.form_token, sessionSecret, nowMs)) {
        return fail(403, 'That form expired. Try again.');
      }

      const token = typeof body.token === 'string' ? body.token.trim() : '';
      if (!token) return fail(400, 'Paste an access token.');

      const user = await resolveAccessTokenUser(store, token, nowMs);
      // One message for every failure — wrong, expired, revoked, unknown. Saying which
      // would tell someone holding a stolen token what they hold.
      if (!user) return fail(401, 'That token is not valid.');
      if (user.tier === 'blocked') return fail(403, 'That account is blocked.');

      // Stamped `src: 'token'` exactly as POST /api/auth/session stamps it, so the
      // session-only operator surfaces keep refusing this cookie. A cookie minted here
      // must carry the token's authority and not a grain more.
      reply.setCookie(
        SESSION_COOKIE_NAME,
        mintSessionToken(user.uid, sessionSecret, DEFAULT_SESSION_DURATION_SECONDS, undefined, 'token'),
        {
          path: '/',
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          maxAge: DEFAULT_SESSION_DURATION_SECONDS,
        },
      );

      return reply.redirect(oauthReturn ?? '/studio');
    },
  );
}
