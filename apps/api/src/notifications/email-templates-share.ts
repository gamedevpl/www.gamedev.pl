import type { Locale } from '@gamedevpl/contract';
import type { EmailMessage } from './mailer.js';
import type { ShareNotificationType } from '../platform/store.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const copy: Record<ShareNotificationType, Record<Locale, { subject: string; lead: string; cta: string }>> = {
  'share.offered': {
    en: {
      subject: 'You were invited to edit a game',
      lead: 'wants you as an editor. Accept in Studio to see the project.',
      cta: 'Open Studio',
    },
    pl: {
      subject: 'Zaproszono cię do edycji gry',
      lead: 'chce, żebyś został edytorem. Przyjmij zaproszenie w Studio, żeby zobaczyć projekt.',
      cta: 'Otwórz Studio',
    },
  },
  'share.accepted': {
    en: {
      subject: 'An editor joined your game',
      lead: 'accepted your invitation and can now edit the project.',
      cta: 'Open Studio',
    },
    pl: {
      subject: 'Edytor dołączył do twojej gry',
      lead: 'przyjął zaproszenie i może teraz edytować projekt.',
      cta: 'Otwórz Studio',
    },
  },
  'share.removed': {
    en: {
      subject: 'You were removed from a game',
      lead: 'removed you as an editor. You no longer have private access.',
      cta: 'Open Studio',
    },
    pl: {
      subject: 'Usunięto cię z gry',
      lead: 'usunął cię z edytorów. Nie masz już prywatnego dostępu.',
      cta: 'Otwórz Studio',
    },
  },
  'share.left': {
    en: {
      subject: 'An editor left your game',
      lead: 'left the collaboration. Remaining members keep their access.',
      cta: 'Open Studio',
    },
    pl: {
      subject: 'Edytor opuścił twoją grę',
      lead: 'opuścił współpracę. Pozostali członkowie zachowują dostęp.',
      cta: 'Otwórz Studio',
    },
  },
};

export function shareNotificationMessage(
  to: string,
  locale: Locale,
  type: ShareNotificationType,
  params: { title: string; actorName: string; actionUrl: string; unsubscribeUrl: string },
): EmailMessage {
  const row = copy[type][locale];
  const unsub =
    locale === 'pl'
      ? 'Otrzymujesz tę wiadomość, ponieważ masz konto na gamedev.pl. Wypisz się:'
      : 'You are receiving this because you have a gamedev.pl account. Unsubscribe:';
  const text = [
    `${params.actorName} — “${params.title}” ${row.lead}`,
    '',
    `${row.cta}: ${params.actionUrl}`,
    '',
    `${unsub} ${params.unsubscribeUrl}`,
  ].join('\n');
  const html = [
    `<p>${escapeHtml(params.actorName)} — “${escapeHtml(params.title)}” ${escapeHtml(row.lead)}</p>`,
    `<p><a href="${escapeHtml(params.actionUrl)}">${escapeHtml(row.cta)}</a></p>`,
    `<p style="color:#888;font-size:12px">${escapeHtml(unsub)} <a href="${escapeHtml(params.unsubscribeUrl)}">${escapeHtml(params.unsubscribeUrl)}</a></p>`,
  ].join('\n');
  return {
    to,
    subject: row.subject,
    text,
    html,
    headers: { 'List-Unsubscribe': `<${params.unsubscribeUrl}>` },
  };
}

export function sharePushContent(
  locale: Locale,
  type: ShareNotificationType,
  title: string,
  actorName: string,
): { title: string; body: string } {
  const row = copy[type][locale];
  return { title: row.subject, body: `${actorName} — “${title}” ${row.lead}` };
}
