import { describe, expect, it } from 'vitest';
import {
  BETA_WELCOME_FROM,
  BETA_WELCOME_REPLY_TO,
  betaWelcomeEmail,
  betaWelcomeMessage,
  emailDomainLooksPolish,
  guessWelcomeLocale,
  parseWelcomeStatuses,
  pickWelcomeRecipients,
  welcomeGivenName,
  welcomeSendBlockedReason,
  type WelcomeCandidate,
} from './beta-welcome-email.js';

function candidate(
  overrides: Partial<WelcomeCandidate> & Pick<WelcomeCandidate, 'uid' | 'email' | 'status'>,
): WelcomeCandidate {
  return overrides;
}

describe('emailDomainLooksPolish', () => {
  it.each([
    ['jan@wp.pl', true],
    ['a@firma.com.pl', true],
    ['bob@gmail.com', false],
    ['x@example.pl.com', false],
  ])('%s -> %s', (email, expected) => {
    expect(emailDomainLooksPolish(email)).toBe(expected);
  });
});

describe('guessWelcomeLocale', () => {
  it('trusts a stored locale over the email domain', () => {
    expect(guessWelcomeLocale({ locale: 'en', email: 'jan@wp.pl' })).toBe('en');
    expect(guessWelcomeLocale({ locale: 'pl-PL', email: 'a@gmail.com' })).toBe('pl');
  });

  it('falls back to a .pl domain when no locale was stored', () => {
    expect(guessWelcomeLocale({ email: 'jan@onet.pl' })).toBe('pl');
    expect(guessWelcomeLocale({ email: 'bob@gmail.com' })).toBe('en');
  });
});

describe('welcomeGivenName', () => {
  it('keeps the first word of a display name', () => {
    expect(welcomeGivenName('Jan Kowalski')).toBe('Jan');
    expect(welcomeGivenName('  Anna  Nowak ')).toBe('Anna');
  });

  it('drops values that are not a given name', () => {
    expect(welcomeGivenName(undefined)).toBeUndefined();
    expect(welcomeGivenName('a@b.com')).toBeUndefined();
    expect(welcomeGivenName('J')).toBeUndefined();
    expect(welcomeGivenName('✨')).toBeUndefined();
  });
});

describe('parseWelcomeStatuses', () => {
  it('accepts pending, approved, and all', () => {
    expect([...parseWelcomeStatuses('pending')]).toEqual(['pending']);
    expect(parseWelcomeStatuses('pending,approved').has('approved')).toBe(true);
    expect(parseWelcomeStatuses('all').has('pending')).toBe(true);
    expect(parseWelcomeStatuses('all').has('approved')).toBe(true);
    expect(parseWelcomeStatuses('all').has('rejected')).toBe(false);
  });

  it('refuses rejected and unknown tokens', () => {
    expect(() => parseWelcomeStatuses('rejected')).toThrow(/rejected/);
    expect(() => parseWelcomeStatuses('maybe')).toThrow(/unknown/);
  });
});

describe('pickWelcomeRecipients', () => {
  const rows: WelcomeCandidate[] = [
    candidate({ uid: 'g:1', email: 'jan@wp.pl', name: 'Jan', status: 'pending', locale: 'pl' }),
    candidate({ uid: 'email:jan@wp.pl', email: 'jan@wp.pl', status: 'pending' }),
    candidate({ uid: 'g:2', email: 'bob@gmail.com', name: 'Bob', status: 'approved', locale: 'en' }),
    candidate({ uid: 'g:3', email: 'skip@x.com', status: 'rejected' }),
    candidate({ uid: 'bot:e2e', email: 'bot@gamedev.pl', status: 'approved' }),
    candidate({ uid: 'g:4', email: 'done@x.com', status: 'pending', welcomeEmailedAt: '2026-08-01T00:00:00Z' }),
    candidate({ uid: 'g:5', email: 'not-an-email', status: 'pending' }),
  ];

  it('dedupes by email, skips rejected/bots/already-sent, and prefers a signed-in uid', () => {
    const picked = pickWelcomeRecipients(rows, { statuses: new Set(['pending', 'approved']) });
    expect(picked.map((row) => row.email)).toEqual(['bob@gmail.com', 'jan@wp.pl']);
    expect(picked.find((row) => row.email === 'jan@wp.pl')?.uid).toBe('g:1');
  });

  it('honours --only, --limit, and --force', () => {
    expect(
      pickWelcomeRecipients(rows, { statuses: new Set(['pending']), only: 'Jan@WP.pl' }).map((row) => row.uid),
    ).toEqual(['g:1']);
    expect(pickWelcomeRecipients(rows, { statuses: new Set(['pending', 'approved']), limit: 1 })).toHaveLength(1);
    expect(
      pickWelcomeRecipients(rows, { statuses: new Set(['pending']), force: true }).map((row) => row.email),
    ).toEqual(['done@x.com', 'jan@wp.pl']);
  });
});

describe('welcomeSendBlockedReason', () => {
  const pending = [candidate({ uid: 'g:1', email: 'a@x.com', status: 'pending' })];

  it('blocks a real send to pending people unless --approve is set', () => {
    expect(welcomeSendBlockedReason({ send: true, approve: false, recipients: pending })).toMatch(/--approve/);
    expect(welcomeSendBlockedReason({ send: true, approve: true, recipients: pending })).toBeUndefined();
    expect(welcomeSendBlockedReason({ send: false, approve: false, recipients: pending })).toBeUndefined();
  });
});

describe('betaWelcomeEmail', () => {
  const params = {
    givenName: 'Anna',
    siteUrl: 'https://www.gamedev.pl',
    replyEmail: BETA_WELCOME_REPLY_TO,
  };

  it('personalises both locales and points at sign-in plus a reply path', () => {
    const en = betaWelcomeEmail('en', params);
    expect(en.subject).toMatch(/closed beta/i);
    expect(en.text).toContain('Hi Anna,');
    expect(en.text).toContain(params.siteUrl);
    expect(en.text).toMatch(/Reply to this email/i);
    expect(en.text.toLowerCase()).not.toContain('arcade');
    expect(en.html).toContain('Hi Anna,');

    const pl = betaWelcomeEmail('pl', params);
    expect(pl.subject).toMatch(/beta/i);
    expect(pl.text).toContain('Cześć Anna,');
    expect(pl.text).toContain('Dziękuję');
    expect(pl.text).toMatch(/odpowiedz na tego maila/i);
    expect(pl.text.toLowerCase()).not.toContain('arcade');
    expect(pl.text).not.toBe(en.text);
  });

  it('falls back to an unnamed greeting', () => {
    expect(betaWelcomeEmail('en', { siteUrl: params.siteUrl, replyEmail: params.replyEmail }).text).toContain('Hi,');
    expect(betaWelcomeEmail('pl', { siteUrl: params.siteUrl, replyEmail: params.replyEmail }).text).toContain('Cześć,');
  });

  it('escapes a hostile given name in HTML only', () => {
    const hostile = { givenName: 'Ann<a>', siteUrl: params.siteUrl, replyEmail: params.replyEmail };
    const html = betaWelcomeEmail('en', hostile).html;
    expect(html).not.toContain('<a>');
    expect(html).toContain('Ann&lt;a&gt;');
    expect(betaWelcomeEmail('en', hostile).text).toContain('Ann<a>');
  });
});

describe('betaWelcomeMessage', () => {
  it('sends from the verified mail subdomain and sets Reply-To so a reply reaches him', () => {
    const msg = betaWelcomeMessage('friend@example.com', 'en', {
      siteUrl: 'https://www.gamedev.pl',
      replyEmail: BETA_WELCOME_REPLY_TO,
    });
    expect(msg.to).toBe('friend@example.com');
    expect(msg.from).toBe(BETA_WELCOME_FROM);
    expect(msg.from).toContain('noreply@mail.gamedev.pl');
    expect(msg.replyTo).toBe(BETA_WELCOME_REPLY_TO);
    expect(msg.html).toBeTruthy();
  });
});
