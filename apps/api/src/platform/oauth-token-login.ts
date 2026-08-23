import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveAccessTokenUser } from './access-token-service.js';
import { canonicalAppBaseUrl } from './canonical-app-url.js';
import { mintSessionToken, SESSION_COOKIE_NAME, TOKEN_SESSION_DURATION_SECONDS } from './auth.js';
import { escapeHtml, MASCOT_SVG, OAUTH_PAGE_STYLES } from './oauth-page-chrome.js';
import type { Store } from './store.js';

export const TOKEN_LOGIN_PATH = '/oauth/token-login';

/**
 * Per-browser CSRF nonce, carried in its own cookie and echoed by the form.
 *
 * The first version of this was an HMAC over a time bucket, which proved only that a
 * form had been rendered *recently* — not that it had been rendered for *this* browser.
 * Anyone could fetch the page, read a currently-valid token, and put it in a cross-site
 * form; the check passed and the login CSRF it was supposed to stop went through. The
 * value has to be one the attacker cannot read, which means one the victim's browser
 * holds.
 *
 * Scoped to this path so it rides on nothing else, and `SameSite=Strict` so it is not
 * even sent on the cross-site POST that would spend it.
 */
const CSRF_COOKIE_NAME = 'gamedev_token_login_csrf';
const CSRF_COOKIE_MAX_AGE_SECONDS = 60 * 60;
/** 32 random bytes, base64url. Anchored and fixed-length, so a huge candidate is
 *  rejected in constant time without ever being copied into a Buffer. */
const CSRF_NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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

export function newCsrfNonce(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Double submit: the nonce in the cookie must equal the nonce in the form body.
 *
 * Both sides are format-checked before either becomes a Buffer, so an oversized or
 * malformed submission costs a regex and nothing else.
 */
function csrfValid(cookieNonce: unknown, submitted: unknown): boolean {
  if (typeof cookieNonce !== 'string' || !CSRF_NONCE_PATTERN.test(cookieNonce)) return false;
  if (typeof submitted !== 'string' || !CSRF_NONCE_PATTERN.test(submitted)) return false;
  // Equal lengths guaranteed by the pattern above, so timingSafeEqual cannot throw.
  return timingSafeEqual(Buffer.from(cookieNonce, 'utf8'), Buffer.from(submitted, 'utf8'));
}

/**
 * Third layer, behind SameSite=Strict and the double-submit nonce.
 *
 * Enforced in production only: browsers send `Origin` on same-origin POSTs too, and the
 * canonical origin is `https://www.gamedev.pl` by default — so enforcing it everywhere
 * would refuse every form submitted against a dev server on localhost. That makes this
 * the one check here that depends on deployment config, which is exactly why it is not
 * the one the other two lean on.
 */
export function originAllowed(request: Pick<FastifyRequest, 'headers'>, isProd: boolean): boolean {
  const origin = request.headers.origin;
  if (!isProd || typeof origin !== 'string' || origin === '') return true;
  return origin === canonicalAppBaseUrl();
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
      token belongs to, for ${TOKEN_SESSION_DURATION_SECONDS / 3600} hours.
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

  const setCsrfCookie = (reply: FastifyReply, nonce: string) => {
    reply.setCookie(CSRF_COOKIE_NAME, nonce, {
      path: TOKEN_LOGIN_PATH,
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
    });
  };

  app.get(TOKEN_LOGIN_PATH, async (request, reply) => {
    const raw = (request.query as { oauth_return?: string }).oauth_return;

    // Reused when the browser already holds one, so a second tab does not invalidate
    // the form open in the first.
    const held = request.cookies[CSRF_COOKIE_NAME];
    const nonce = typeof held === 'string' && CSRF_NONCE_PATTERN.test(held) ? held : newCsrfNonce();
    if (nonce !== held) setCsrfCookie(reply, nonce);

    return reply
      .type('text/html')
      .header('cache-control', 'no-store')
      .send(
        tokenLoginHtml({
          oauthReturn: typeof raw === 'string' ? sanitizeOAuthReturnPath(raw) : null,
          formToken: nonce,
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

      // A refusal has to hand back a form that can actually be submitted, so it carries
      // the browser's live nonce — minting one if the reason for the refusal was that
      // the browser had none.
      const held = request.cookies[CSRF_COOKIE_NAME];
      const liveNonce = typeof held === 'string' && CSRF_NONCE_PATTERN.test(held) ? held : newCsrfNonce();

      const fail = (status: number, error: string) => {
        if (liveNonce !== held) setCsrfCookie(reply, liveNonce);
        return reply
          .status(status)
          .type('text/html')
          .header('cache-control', 'no-store')
          .send(tokenLoginHtml({ oauthReturn, formToken: liveNonce, error }));
      };

      // Login CSRF. `sameSite: 'lax'` on the session cookie does not stop a top-level
      // cross-site form POST, and the next thing this flow does is ask the browser to
      // approve durable write access — so an attacker who can silently sign a visitor
      // into an account they control gets that approval from someone else's browser.
      if (!originAllowed(request, isProd)) return fail(403, 'That request did not come from gamedev.pl.');
      if (!csrfValid(held, body.form_token)) return fail(403, 'That form expired. Reload and try again.');

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
        mintSessionToken(user.uid, sessionSecret, TOKEN_SESSION_DURATION_SECONDS, undefined, 'token'),
        {
          path: '/',
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          maxAge: TOKEN_SESSION_DURATION_SECONDS,
        },
      );

      // Spent. The next visit mints a fresh one rather than reusing a nonce that has
      // already been exchanged for a session.
      reply.clearCookie(CSRF_COOKIE_NAME, { path: TOKEN_LOGIN_PATH });

      return reply.redirect(oauthReturn ?? '/studio');
    },
  );
}
