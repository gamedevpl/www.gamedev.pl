// Rendered email bodies. Kept separate from the mailer transport so copy and
// localization live in one place and can be unit-tested without a provider.
//
// Invites are transactional one-offs (a single invitation, not a subscription),
// so they carry no List-Unsubscribe — that header belongs to the recurring
// notification mails described in docs/notifications-plan.md.

import type { Locale } from '@gamedevpl/contract';
import type { EmailMessage } from './mailer.js';
import type {
  OperatorNotificationType,
  ProposalNotificationType,
  SubmissionNotificationType,
} from '../platform/store.js';

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

const notificationCopy: Record<
  SubmissionNotificationType,
  Record<Locale, { subject: string; lead: string; cta: string }>
> = {
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
  // A nudge, not an alarm: the live game keeps working — its published bundle froze the
  // engine it shipped with — but the platform underneath has moved on, and an
  // improvement round is what brings the game along. Framed as an invitation because
  // it is one: the creator touching their game again is the good outcome here.
  'submission.game_health': {
    en: {
      subject: 'Your game could use a refresh',
      lead: 'no longer passes our checks on the latest engine. It still plays fine — but a quick improvement round would bring it up to date.',
      cta: 'Improve it',
    },
    pl: {
      subject: 'Twojej grze przydałoby się odświeżenie',
      lead: 'nie przechodzi już naszych testów na najnowszym silniku. Nadal działa — ale krótka runda ulepszeń przywróci ją do formy.',
      cta: 'Ulepsz ją',
    },
  },
};

/**
 * Proposal copy, kept apart from the submission table because the sentence has a
 * different subject.
 *
 * A submission notification says "«your game» happened to you". A proposal notification
 * says "somebody wants to change «your game»", or "the change you sent was decided" —
 * the actor is a second person, and the lead has to name them or the mail reads as though
 * the platform did something to the recipient's game on its own.
 */
const proposalCopy: Record<ProposalNotificationType, Record<Locale, { subject: string; lead: string; cta: string }>> = {
  'proposal.awaiting_review': {
    en: {
      subject: 'Someone proposed a change to your game',
      lead: 'has a proposed change waiting for you. It passed our checks and test run — you decide whether it lands.',
      cta: 'Review it',
    },
    pl: {
      subject: 'Ktoś zaproponował zmianę w twojej grze',
      lead: 'ma czekającą propozycję zmiany. Przeszła nasze testy — ty decydujesz, czy trafi do gry.',
      cta: 'Zobacz propozycję',
    },
  },
  'proposal.decided': {
    en: {
      subject: 'Your proposal was reviewed',
      lead: 'has been reviewed. Open it to see what the owner said.',
      cta: 'See the decision',
    },
    pl: {
      subject: 'Twoja propozycja została oceniona',
      lead: 'została oceniona. Otwórz ją, aby zobaczyć odpowiedź autora.',
      cta: 'Zobacz decyzję',
    },
  },
  'proposal.merged': {
    en: {
      subject: 'Your contribution is live',
      lead: 'is now part of the published game. You are a watcher on it — we will send a digest when it changes.',
      cta: 'Play it',
    },
    pl: {
      subject: 'Twoja zmiana jest na żywo',
      lead: 'jest już częścią opublikowanej gry. Obserwujesz ją — wyślemy podsumowanie, gdy się zmieni.',
      cta: 'Zagraj',
    },
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
  type: SubmissionNotificationType,
  title: string,
): { title: string; body: string } {
  const copy = notificationCopy[type][locale];
  return { title: copy.subject, body: `“${title}” ${copy.lead}` };
}

/**
 * Push copy for "a game you follow has a new version".
 *
 * Its own function rather than a row in `notificationCopy`, which is keyed by
 * submission type: this notification is about somebody else's game, addressed to a
 * player rather than a creator, and folding it in would widen that table's meaning.
 */
export function followedGamePushContent(locale: Locale, title: string): { title: string; body: string } {
  return locale === 'pl'
    ? { title: 'Nowa wersja gry, którą obserwujesz', body: `„${title}” ma nową wersję.` }
    : { title: 'A game you follow was updated', body: `“${title}” has a new version.` };
}

/** Short push copy for a proposal event, from the same strings as the email. */
export function proposalPushContent(
  locale: Locale,
  type: ProposalNotificationType,
  title: string,
): { title: string; body: string } {
  const copy = proposalCopy[type][locale];
  return { title: copy.subject, body: `“${title}” ${copy.lead}` };
}

export function proposalNotificationMessage(
  to: string,
  locale: Locale,
  type: ProposalNotificationType,
  params: NotificationEmailParams,
): EmailMessage {
  return renderNotificationEmail(to, locale, proposalCopy[type][locale], params);
}

export function submissionNotificationMessage(
  to: string,
  locale: Locale,
  type: SubmissionNotificationType,
  params: NotificationEmailParams,
): EmailMessage {
  return renderNotificationEmail(to, locale, notificationCopy[type][locale], params);
}

/** The shared body. Both families render identically; only the strings differ. */
function renderNotificationEmail(
  to: string,
  locale: Locale,
  copy: { subject: string; lead: string; cta: string },
  params: NotificationEmailParams,
): EmailMessage {
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

/**
 * The weekly creator digest (docs/improvement-loop-plan.md IL-2).
 *
 * Its own copy rather than another entry in `notificationCopy`, because that shape is
 * "«game title» happened" and a digest has no single game. The counts are numbers this
 * system computed — no player-written text reaches an email, which is the reason the
 * digest reports how many notes arrived rather than what they said.
 */
export interface DigestEmailParams {
  games: number;
  sessions: number;
  votesUp: number;
  votesDown: number;
  feedback: number;
  actionUrl: string;
  unsubscribeUrl: string;
}

/**
 * Labelled counts rather than a sentence, in both languages, and deliberately so.
 *
 * A sentence has to agree with its numbers: English needs "1 session" vs "2 sessions", and
 * Polish needs three forms (1 sesja / 2–4 sesje / 5+ sesji) that a binary conditional gets
 * wrong for exactly the range a small game lands in. Labels do not agree with anything, so
 * every value is correct without a plural-rules table nobody would maintain.
 */
const digestCopy: Record<Locale, { subject: string; cta: string; line: (p: DigestEmailParams) => string }> = {
  en: {
    subject: 'Your games this week on gamedev.pl',
    cta: 'See the details',
    line: (p) =>
      `Sessions: ${p.sessions} · Games: ${p.games} · ${p.votesUp}👍 ${p.votesDown}👎 · ` +
      `Notes from players: ${p.feedback}`,
  },
  pl: {
    subject: 'Twoje gry w tym tygodniu na gamedev.pl',
    cta: 'Zobacz szczegóły',
    line: (p) =>
      `Sesje: ${p.sessions} · Gry: ${p.games} · ${p.votesUp}👍 ${p.votesDown}👎 · ` +
      `Wiadomości od graczy: ${p.feedback}`,
  },
};

export function digestNotificationMessage(to: string, locale: Locale, params: DigestEmailParams): EmailMessage {
  const copy = digestCopy[locale];
  const actionUrl = escapeHtml(params.actionUrl);
  const unsub = escapeHtml(params.unsubscribeUrl);
  const line = copy.line(params);

  const text = [
    line,
    '',
    `${copy.cta}: ${params.actionUrl}`,
    '',
    `${unsubscribeLine[locale]} ${params.unsubscribeUrl}`,
  ].join('\n');

  const html = [
    `<p>${escapeHtml(line)}</p>`,
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
    headers: { 'List-Unsubscribe': `<${params.unsubscribeUrl}>` },
  };
}

/** Push copy for a digest — same numbers, shorter. */
export function digestPushContent(locale: Locale, params: DigestEmailParams): { title: string; body: string } {
  const copy = digestCopy[locale];
  return { title: copy.subject, body: copy.line(params) };
}

// --- Operator alerts (operator-alerts.ts) ---
//
// English only, on the same reasoning as the contact mail below and the console itself:
// the recipient is the operator mailbox rather than a member of the public, and a second
// language for a surface one person reads costs more than it explains.
//
// No unsubscribe link, and deliberately: this is not a subscription, it is the queue
// telling somebody it needs them. The way to stop it is to leave ADMIN_UIDS, which is
// also the way to stop being the person these are about.

export interface OperatorEmailParams {
  /** Sanitized game title, or a waitlist applicant's display label. */
  title: string;
  /** Present for job alerts; absent for waitlist joins (no issue). */
  issueNumber?: number;
  /** Absolute URL to the console. */
  actionUrl: string;
  /** Machine-readable extra, e.g. which kind of stall. Rendered verbatim, so keep it ours. */
  detail?: string;
  /** Waitlist joins: the applicant's email when the token carried a verified one. */
  email?: string;
}

const operatorCopy: Record<OperatorNotificationType, { subject: string; lead: string; cta: string }> = {
  'operator.review_ready': {
    subject: 'A build is waiting to be published',
    lead: 'passed the gate and is waiting for the publish decision.',
    cta: 'Open the queue',
  },
  'operator.build_failed': {
    subject: 'A build failed',
    lead: 'ended without delivering a game.',
    cta: 'Open the queue',
  },
  'operator.build_stalled': {
    subject: 'A build has stopped moving',
    lead: 'has not moved for longer than its state allows.',
    cta: 'Open the queue',
  },
  'operator.feedback_undelivered': {
    subject: 'A change request is not reaching the agent',
    lead: 'has a creator’s change request that no agent has collected — the relay may be down.',
    cta: 'Open the queue',
  },
  'operator.game_unhealthy': {
    subject: 'A live game failed its health check',
    lead: 'no longer passes the check on the current engine. It still serves — the creator has been nudged to refresh it.',
    cta: 'Open the queue',
  },
  'operator.waitlist_joined': {
    subject: 'Someone joined the beta waitlist',
    lead: 'asked to join the closed beta.',
    cta: 'Open telemetry',
  },
  'operator.review_sweep': {
    subject: 'A review sweep is ready',
    lead: 'has games waiting on the review desk.',
    cta: 'Open the review desk',
  },
};

export function operatorPushContent(type: OperatorNotificationType, title: string): { title: string; body: string } {
  const copy = operatorCopy[type];
  return { title: copy.subject, body: `“${title}” ${copy.lead}` };
}

export function operatorNotificationMessage(
  to: string,
  type: OperatorNotificationType,
  params: OperatorEmailParams,
): EmailMessage {
  const copy = operatorCopy[type];
  const actionUrl = escapeHtml(params.actionUrl);
  const detail = params.detail ? ` (${params.detail})` : '';
  const emailLine = params.email;
  const jobLine = params.issueNumber !== undefined ? `Job #${params.issueNumber}` : undefined;

  const text = [
    `“${params.title}” ${copy.lead}${detail}`,
    ...(emailLine ? ['', emailLine] : []),
    ...(jobLine ? ['', jobLine] : []),
    '',
    `${copy.cta}: ${params.actionUrl}`,
  ].join('\n');

  const html = [
    `<p>“${escapeHtml(params.title)}” ${escapeHtml(copy.lead)}${escapeHtml(detail)}</p>`,
    ...(emailLine ? [`<p style="color:#888;font-size:12px">${escapeHtml(emailLine)}</p>`] : []),
    ...(jobLine ? [`<p style="color:#888;font-size:12px">${escapeHtml(jobLine)}</p>`] : []),
    `<p><a href="${actionUrl}">${escapeHtml(copy.cta)}</a></p>`,
  ].join('\n');

  return { to, subject: `${copy.subject}: ${params.title}`.slice(0, 200), text, html };
}

export interface ContactEmailParams {
  name: string;
  email: string;
  message: string;
}

/**
 * Operator-facing mail for the public contact form. English only — the recipient
 * is the operator mailbox, not the writer, so bilingual copy is unnecessary.
 * The writer's locale is irrelevant to a single admin inbox.
 */
export function renderContactEmail(params: ContactEmailParams): RenderedEmail {
  const subject = `Contact form: ${params.name}`.slice(0, 200);
  const text = [
    `From: ${params.name} <${params.email}>`,
    '',
    params.message,
    '',
    '—',
    'Sent via the gamedev.pl contact form. Reply to this email to reach the writer.',
  ].join('\n');

  const htmlMessage = escapeHtml(params.message).replace(/\r\n|\r|\n/g, '<br>');
  const html = [
    `<p><strong>From:</strong> ${escapeHtml(params.name)} &lt;${escapeHtml(params.email)}&gt;</p>`,
    `<p>${htmlMessage}</p>`,
    '<hr>',
    '<p style="color:#888;font-size:12px">Sent via the gamedev.pl contact form. Reply to this email to reach the writer.</p>',
  ].join('\n');

  return { subject, text, html };
}
