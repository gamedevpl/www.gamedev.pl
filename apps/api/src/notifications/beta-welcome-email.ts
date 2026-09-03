import type { Locale, WaitlistStatus } from '@gamedevpl/contract';
import { normalizeLocale } from './email-templates.js';
import type { EmailMessage } from './mailer.js';

export const BETA_WELCOME_FROM = 'Grzegorz <noreply@mail.gamedev.pl>';
export const BETA_WELCOME_REPLY_TO = 'grzegorz@gamedev.pl';
export const BETA_WELCOME_SITE_URL = 'https://www.gamedev.pl';

export interface WelcomeCandidate {
  uid: string;
  email: string;
  name?: string;
  locale?: string;
  status: WaitlistStatus;
  requestedAt?: string;
  welcomeEmailedAt?: string;
}

export interface BetaWelcomeParams {
  givenName?: string;
  siteUrl: string;
  replyEmail: string;
}

export interface WelcomePickOptions {
  statuses: ReadonlySet<WaitlistStatus>;
  only?: string;
  force?: boolean;
  limit?: number;
}

export function emailDomainLooksPolish(email: string): boolean {
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  return domain.endsWith('.pl');
}

export function guessWelcomeLocale(input: { locale?: string; email: string }): Locale {
  if (input.locale?.trim()) return normalizeLocale(input.locale);
  return emailDomainLooksPolish(input.email) ? 'pl' : 'en';
}

export function welcomeGivenName(name: string | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || first.includes('@') || first.length < 2) return undefined;
  if (!/\p{L}/u.test(first)) return undefined;
  return first;
}

export function parseWelcomeStatuses(raw: string): Set<WaitlistStatus> {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'all') return new Set(['pending', 'approved']);
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  const out = new Set<WaitlistStatus>();
  for (const part of parts) {
    if (part === 'pending' || part === 'approved') {
      out.add(part);
      continue;
    }
    if (part === 'rejected') {
      throw new Error('beta:welcome does not email rejected applicants');
    }
    throw new Error(`unknown waitlist status: ${part}`);
  }
  if (out.size === 0) throw new Error('no waitlist statuses selected');
  return out;
}

export function welcomeSendBlockedReason(opts: {
  send: boolean;
  approve: boolean;
  recipients: readonly WelcomeCandidate[];
}): string | undefined {
  if (!opts.send || opts.approve) return undefined;
  if (opts.recipients.some((row) => row.status === 'pending')) {
    return 'pending recipients need --approve before --send (otherwise they cannot sign in)';
  }
  return undefined;
}

export function welcomeNeedsApprove(approve: boolean, status: WaitlistStatus): boolean {
  return approve && status === 'pending';
}

export async function runWelcomeDelivery<T>(ops: {
  shouldApprove: boolean;
  approve: () => Promise<void>;
  send: () => Promise<T>;
  stamp: () => Promise<unknown>;
}): Promise<T> {
  if (ops.shouldApprove) await ops.approve();
  const result = await ops.send();
  await ops.stamp();
  return result;
}

function welcomeStatusSelected(status: WaitlistStatus, statuses: ReadonlySet<WaitlistStatus>): boolean {
  if (statuses.has(status)) return true;
  return status === 'approved' && statuses.has('pending');
}

function signedAccountUid(uid: string): boolean {
  return uid.startsWith('g:') || uid.startsWith('a:');
}

function preferCandidate(left: WelcomeCandidate, right: WelcomeCandidate): number {
  const approved = (status: WaitlistStatus) => (status === 'approved' ? 0 : 1);
  const signed = (uid: string) => (signedAccountUid(uid) ? 0 : 1);
  return approved(left.status) - approved(right.status) || signed(left.uid) - signed(right.uid);
}

export function pickWelcomeRecipients(
  entries: readonly WelcomeCandidate[],
  opts: WelcomePickOptions,
): WelcomeCandidate[] {
  const only = opts.only?.trim().toLowerCase();
  const byEmail = new Map<string, WelcomeCandidate>();
  for (const entry of entries) {
    const email = entry.email.trim().toLowerCase();
    if (!email.includes('@')) continue;
    if (entry.status === 'rejected') continue;
    if (entry.uid.startsWith('bot:')) continue;
    if (!welcomeStatusSelected(entry.status, opts.statuses)) continue;
    if (only && email !== only) continue;
    if (entry.welcomeEmailedAt && !opts.force) continue;
    const current = byEmail.get(email);
    const next = { ...entry, email };
    if (!current || preferCandidate(next, current) < 0) byEmail.set(email, next);
  }
  const selected = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  return opts.limit === undefined ? selected : selected.slice(0, opts.limit);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function greeting(locale: Locale, givenName: string | undefined): string {
  if (locale === 'pl') return givenName ? `Cześć ${givenName},` : 'Cześć,';
  return givenName ? `Hi ${givenName},` : 'Hi,';
}

function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(/\r\n|\r|\n/g, '<br>');
      return `<p>${escaped}</p>`;
    })
    .join('\n');
}

function cliPageUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/cli`;
}

const welcomeCopy: Record<Locale, (p: BetaWelcomeParams) => { subject: string; paragraphs: string[] }> = {
  en: ({ givenName, siteUrl }) => ({
    subject: "You're in — gamedev.pl closed beta",
    paragraphs: [
      greeting('en', givenName),
      'Thank you for wanting to join the gamedev.pl closed beta. I kept this round small on purpose, and I am glad you asked to be part of it.',
      `Your access is open. Sign in again at ${siteUrl} with the same Google or Apple account you used to join the list.`,
      [
        'A few things that help most:',
        '1. Play a handful of games — on your phone too, if you can.',
        '2. If you have an idea, try making one: describe it in a sentence and let an agent build it.',
        '3. Tell me what feels off, confusing, or delightful. Reply to this email, or use the contact form on the site. I read everything.',
      ].join('\n'),
      `If you work in a terminal: ${cliPageUrl(siteUrl)}`,
      'This is a real beta. Things will break, and that is useful.',
      'See you inside,\nGrzegorz\ngamedev.pl',
    ],
  }),
  pl: ({ givenName, siteUrl }) => ({
    subject: 'Jesteś w środku — zamknięta beta gamedev.pl',
    paragraphs: [
      greeting('pl', givenName),
      'Dziękuję za chęć dołączenia do zamkniętej bety gamedev.pl. Świadomie trzymam to w małym gronie i cieszę się, że chcesz być częścią.',
      `Dostęp jest otwarty. Zaloguj się ponownie na ${siteUrl} tym samym kontem Google albo Apple co przy zapisie na listę.`,
      [
        'Kilka rzeczy, które pomagają najbardziej:',
        '1. Zagraj w kilka gier — też na telefonie, jeśli możesz.',
        '2. Jeśli masz pomysł, spróbuj zbudować własną: opisz ją zdaniem, agent zrobi resztę.',
        '3. Napisz, gdy coś zgrzyta, jest niejasne albo akurat trafione. Najłatwiej: odpowiedz na tego maila albo użyj formularza kontaktowego na stronie. Czytam wszystko.',
      ].join('\n'),
      `Jeśli wolisz terminal: ${cliPageUrl(siteUrl)}`,
      'To prawdziwa beta. Rzeczy będą się psuć — i właśnie o to chodzi.',
      'Do zobaczenia,\nGrzegorz\ngamedev.pl',
    ],
  }),
};

export function betaWelcomeEmail(
  locale: Locale,
  params: BetaWelcomeParams,
): { subject: string; text: string; html: string } {
  const { subject, paragraphs } = welcomeCopy[locale](params);
  return { subject, text: paragraphs.join('\n\n'), html: paragraphsToHtml(paragraphs) };
}

export function betaWelcomeMessage(
  to: string,
  locale: Locale,
  params: BetaWelcomeParams,
  from: string = BETA_WELCOME_FROM,
): EmailMessage {
  const { subject, text, html } = betaWelcomeEmail(locale, params);
  return { to, subject, text, html, replyTo: params.replyEmail, from };
}
