import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Locale } from '@gamedevpl/contract';
import { escapeHtml, MASCOT_SVG, OAUTH_PAGE_STYLES } from './oauth-page-chrome.js';
import { CREATOR_SCOPE, MCP_SCOPE, scopeIncludes } from './oauth-scopes.js';
import { AS_REFRESH_TOKEN_TTL_MS } from './oauth-tokens.js';

const INACTIVITY_DAYS = Math.round(AS_REFRESH_TOKEN_TTL_MS / (24 * 60 * 60 * 1000));

export function consentToken(input: { uid: string; clientId: string; codeChallenge: string; secret: string }): string {
  return createHmac('sha256', input.secret)
    .update(`oauth-consent-v1:${input.uid}:${input.clientId}:${input.codeChallenge}`)
    .digest('hex');
}

export function consentTokenValid(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function mcpCopy(lang: Locale, client: string): ConsentCopy {
  return lang === 'pl'
    ? {
        title: `Połącz ${client}`,
        lead: `${client} prosi o budowanie gier na Twoim koncie.`,
        as: 'Zatwierdzasz jako',
        canTitle: 'Będzie mógł',
        can: [
          'Rozpoczynać i kontynuować rundy budowania Twoich gier',
          'Zużywać Twój dzienny limit poprawek',
          'Czytać i zastępować źródła Twoich gier',
          'Publikować nowe wersje w katalogu',
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
          'Publish new versions to the catalog',
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
}

function creatorCopy(lang: Locale, client: string): ConsentCopy {
  return lang === 'pl'
    ? {
        ...mcpCopy(lang, client),
        lead: `${client} prosi o zarządzanie Twoimi grami i profilem na gamedev.pl.`,
        can: ['Zarządzać Twoimi grami i profilem na gamedev.pl'],
        cannot: [
          'Publikować gier w katalogu',
          'Usuwać konta',
          'Dotykać gier, których nie jesteś właścicielem',
          'Zmieniać Twojego logowania',
        ],
      }
    : {
        ...mcpCopy(lang, client),
        lead: `${client} is asking to manage your games and profile on gamedev.pl.`,
        can: ['Manage your games and profile on gamedev.pl'],
        cannot: [
          'Publish games to the catalog',
          'Delete your account',
          'Touch games you do not own',
          'Change how you sign in',
        ],
      };
}

interface ConsentCopy {
  title: string;
  lead: string;
  as: string;
  canTitle: string;
  can: string[];
  cannotTitle: string;
  cannot: string[];
  redirect: string;
  redirectHint: string;
  duration: string;
  approve: string;
  deny: string;
  bail: string;
}

function copyForScope(lang: Locale, client: string, scope: string): ConsentCopy {
  const mcp = scopeIncludes(scope, MCP_SCOPE);
  const creator = scopeIncludes(scope, CREATOR_SCOPE);
  if (creator && !mcp) return creatorCopy(lang, client);
  const copy = mcpCopy(lang, client);
  if (creator && mcp) {
    copy.can = [...creatorCopy(lang, client).can, ...copy.can];
  }
  return copy;
}

export function consentHtml(input: {
  lang: Locale;
  redirectUri: string;
  clientId: string;
  clientName?: string;
  account?: string;
  state?: string;
  codeChallenge: string;
  scope: string;
  consentToken: string;
  device?: string;
}): string {
  const client = input.clientName?.trim() || input.clientId;
  const copy = copyForScope(input.lang, client, input.scope);

  const hidden = [
    `<input type="hidden" name="client_id" value="${escapeHtml(input.clientId)}" />`,
    `<input type="hidden" name="redirect_uri" value="${escapeHtml(input.redirectUri)}" />`,
    input.state ? `<input type="hidden" name="state" value="${escapeHtml(input.state)}" />` : '',
    `<input type="hidden" name="code_challenge" value="${escapeHtml(input.codeChallenge)}" />`,
    `<input type="hidden" name="code_challenge_method" value="S256" />`,
    `<input type="hidden" name="scope" value="${escapeHtml(input.scope)}" />`,
    input.device ? `<input type="hidden" name="device" value="${escapeHtml(input.device)}" />` : '',
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
