// Rendered email bodies. Kept separate from the mailer transport so copy and
// localization live in one place and can be unit-tested without a provider.
//
// Invites are transactional one-offs (a single invitation, not a subscription),
// so they carry no List-Unsubscribe — that header belongs to the recurring
// notification mails described in docs/notifications-plan.md.

import type { EmailMessage } from './mailer.js';
import type { NotificationType } from './store.js';

export type Locale = 'en' | 'pl';

export function normalizeLocale(value: string | undefined): Locale {
  return value?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BetaInviteParams {
  /** Where the invitee lands to sign in — our own origin, e.g. https://www.gamedev.pl */
  inviteUrl: string;
}

const inviteCopy: Record<Locale, (p: BetaInviteParams) => RenderedEmail> = {
  en: ({ inviteUrl }) => {
    const url = escapeHtml(inviteUrl);
    return {
      subject: "You're invited to the gamedev.pl closed beta",
      text: [
        'Hi,',
        '',
        "You've been invited to the closed beta of gamedev.pl — describe a game in a",
        'sentence, an AI builds it, and you play it right in your browser.',
        '',
        'To start, open the link below and sign in with Google using the email address',
        'this invitation was sent to:',
        '',
        inviteUrl,
        '',
        'Your access is already approved — just sign in.',
        '',
        'See you there,',
        'The gamedev.pl team',
      ].join('\n'),
      html: [
        '<p>Hi,</p>',
        "<p>You've been invited to the closed beta of <strong>gamedev.pl</strong> — describe a game in a sentence, an AI builds it, and you play it right in your browser.</p>",
        `<p>To start, <a href="${url}">open gamedev.pl</a> and sign in with Google using the email address this invitation was sent to.</p>`,
        '<p>Your access is already approved — just sign in.</p>',
        '<p>See you there,<br>The gamedev.pl team</p>',
      ].join('\n'),
    };
  },
  pl: ({ inviteUrl }) => {
    const url = escapeHtml(inviteUrl);
    return {
      subject: 'Zaproszenie do zamkniętej wersji beta gamedev.pl',
      text: [
        'Cześć,',
        '',
        'Masz zaproszenie do zamkniętej wersji beta gamedev.pl — opisz grę jednym',
        'zdaniem, AI ją zbuduje, a Ty zagrasz od razu w przeglądarce.',
        '',
        'Aby zacząć, otwórz poniższy link i zaloguj się przez Google, używając adresu',
        'e-mail, na który przyszło to zaproszenie:',
        '',
        inviteUrl,
        '',
        'Twój dostęp jest już zatwierdzony — wystarczy się zalogować.',
        '',
        'Do zobaczenia,',
        'Zespół gamedev.pl',
      ].join('\n'),
      html: [
        '<p>Cześć,</p>',
        '<p>Masz zaproszenie do zamkniętej wersji beta <strong>gamedev.pl</strong> — opisz grę jednym zdaniem, AI ją zbuduje, a Ty zagrasz od razu w przeglądarce.</p>',
        `<p>Aby zacząć, <a href="${url}">otwórz gamedev.pl</a> i zaloguj się przez Google, używając adresu e-mail, na który przyszło to zaproszenie.</p>`,
        '<p>Twój dostęp jest już zatwierdzony — wystarczy się zalogować.</p>',
        '<p>Do zobaczenia,<br>Zespół gamedev.pl</p>',
      ].join('\n'),
    };
  },
};

/** Compose a beta-invite email for the given locale. */
export function betaInviteEmail(locale: Locale, params: BetaInviteParams): RenderedEmail {
  return inviteCopy[locale](params);
}

/** Build a ready-to-send message for a single recipient. */
export function betaInviteMessage(to: string, locale: Locale, params: BetaInviteParams): EmailMessage {
  const { subject, text, html } = betaInviteEmail(locale, params);
  return { to, subject, text, html };
}

// --- Notification emails (docs/notifications-plan.md M1.5) ---
//
// Unlike the one-off invite, these are subscription-like, so every one carries a
// visible unsubscribe link plus a List-Unsubscribe header. Copy is intentionally
// short; `title` is the sanitized game title.

export interface NotificationEmailParams {
  /** Sanitized game title. */
  title: string;
  /** Absolute URL to the relevant page (status or play). */
  actionUrl: string;
  /** Absolute one-click unsubscribe URL (signed token). */
  unsubscribeUrl: string;
}

const notificationCopy: Record<NotificationType, Record<Locale, { subject: string; lead: string; cta: string }>> = {
  'submission.published': {
    en: { subject: 'Your game is live on gamedev.pl', lead: 'is published and ready to play.', cta: 'Play it' },
    pl: {
      subject: 'Twoja gra jest już dostępna na gamedev.pl',
      lead: 'została opublikowana i można w nią zagrać.',
      cta: 'Zagraj',
    },
  },
  'submission.building': {
    en: { subject: 'Your game is being built', lead: 'is being built right now.', cta: 'Follow along' },
    pl: { subject: 'Twoja gra jest tworzona', lead: 'jest właśnie tworzona.', cta: 'Śledź postęp' },
  },
  'submission.needs_changes': {
    en: { subject: 'Your gamedev.pl submission needs changes', lead: 'needs another look.', cta: 'See details' },
    pl: { subject: 'Twoje zgłoszenie na gamedev.pl wymaga zmian', lead: 'wymaga poprawek.', cta: 'Zobacz szczegóły' },
  },
};

const unsubscribeLine: Record<Locale, string> = {
  en: 'You are receiving this because you submitted a game to gamedev.pl. Unsubscribe:',
  pl: 'Otrzymujesz tę wiadomość, ponieważ zgłosiłeś grę na gamedev.pl. Wypisz się:',
};

/**
 * Short push-notification copy for a submission event. Reuses the same bilingual
 * strings as the email so the two channels stay consistent — the OS notification
 * shows `title` (the subject line) and `body` (the game title + lead).
 */
export function submissionPushContent(
  locale: Locale,
  type: NotificationType,
  title: string,
): { title: string; body: string } {
  const copy = notificationCopy[type][locale];
  return { title: copy.subject, body: `“${title}” ${copy.lead}` };
}

export function submissionNotificationMessage(
  to: string,
  locale: Locale,
  type: NotificationType,
  params: NotificationEmailParams,
): EmailMessage {
  const copy = notificationCopy[type][locale];
  const title = params.title;
  const actionUrl = escapeHtml(params.actionUrl);
  const unsub = escapeHtml(params.unsubscribeUrl);

  const text = [
    `“${title}” ${copy.lead}`,
    '',
    `${copy.cta}: ${params.actionUrl}`,
    '',
    `${unsubscribeLine[locale]} ${params.unsubscribeUrl}`,
  ].join('\n');

  const html = [
    `<p>“${escapeHtml(title)}” ${escapeHtml(copy.lead)}</p>`,
    `<p><a href="${actionUrl}">${escapeHtml(copy.cta)}</a></p>`,
    `<p style="color:#888;font-size:12px">${escapeHtml(unsubscribeLine[locale])} <a href="${unsub}">${escapeHtml(
      params.unsubscribeUrl,
    )}</a></p>`,
  ].join('\n');

  return {
    to,
    subject: copy.subject,
    text,
    html,
    // RFC 2369: lets mail clients surface a native unsubscribe control.
    headers: { 'List-Unsubscribe': `<${params.unsubscribeUrl}>` },
  };
}
