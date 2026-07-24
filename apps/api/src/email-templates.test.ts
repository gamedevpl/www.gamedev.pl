import { describe, expect, it } from 'vitest';
import { betaInviteEmail, betaInviteMessage, normalizeLocale } from './email-templates.js';

describe('normalizeLocale', () => {
  it.each([
    ['pl', 'pl'],
    ['pl-PL', 'pl'],
    ['PL', 'pl'],
    ['en', 'en'],
    ['en-US', 'en'],
    [undefined, 'en'],
    ['fr', 'en'],
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeLocale(input as string | undefined)).toBe(expected);
  });
});

describe('betaInviteEmail', () => {
  const inviteUrl = 'https://www.gamedev.pl';

  it('includes the invite URL in both plain text and HTML for each locale', () => {
    for (const locale of ['en', 'pl'] as const) {
      const email = betaInviteEmail(locale, { inviteUrl });
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.text).toContain(inviteUrl);
      expect(email.html).toContain(inviteUrl);
    }
  });

  it('uses locale-specific subjects', () => {
    expect(betaInviteEmail('en', { inviteUrl }).subject).toMatch(/invited/i);
    expect(betaInviteEmail('pl', { inviteUrl }).subject).toMatch(/Zaproszenie/i);
  });

  it('escapes HTML metacharacters in the invite URL to prevent attribute breakout', () => {
    const hostile = 'https://www.gamedev.pl/?x="><script>alert(1)</script>';
    const email = betaInviteEmail('en', { inviteUrl: hostile });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    // Plain text keeps the raw URL (no markup to break out of).
    expect(email.text).toContain(hostile);
  });
});

describe('betaInviteMessage', () => {
  it('targets the recipient and carries subject/text/html', () => {
    const msg = betaInviteMessage('friend@example.com', 'en', { inviteUrl: 'https://www.gamedev.pl' });
    expect(msg.to).toBe('friend@example.com');
    expect(msg.subject).toMatch(/invited/i);
    expect(msg.text).toContain('https://www.gamedev.pl');
    expect(msg.html).toContain('https://www.gamedev.pl');
  });
});
