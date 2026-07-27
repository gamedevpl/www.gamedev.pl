import { describe, expect, it } from 'vitest';
import {
  betaInviteEmail,
  betaInviteMessage,
  normalizeLocale,
  renderContactEmail,
  submissionNotificationMessage,
} from './email-templates.js';

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

describe('submissionNotificationMessage', () => {
  const params = {
    title: 'Sky Dodge',
    actionUrl: 'https://www.gamedev.pl/play/sky-dodge',
    unsubscribeUrl: 'https://www.gamedev.pl/api/email/unsubscribe?token=abc',
  };

  it('carries a locale-specific subject, the action + unsubscribe URLs, and a List-Unsubscribe header', () => {
    const en = submissionNotificationMessage('me@example.com', 'en', 'submission.published', params);
    expect(en.to).toBe('me@example.com');
    expect(en.subject).toMatch(/live/i);
    expect(en.text).toContain(params.actionUrl);
    expect(en.text).toContain(params.unsubscribeUrl);
    expect(en.headers?.['List-Unsubscribe']).toBe(`<${params.unsubscribeUrl}>`);

    const pl = submissionNotificationMessage('me@example.com', 'pl', 'submission.published', params);
    expect(pl.subject).not.toBe(en.subject);
  });

  it('has distinct copy per event type', () => {
    const subjects = (['submission.building', 'submission.published', 'submission.needs_changes'] as const).map(
      (t) => submissionNotificationMessage('me@example.com', 'en', t, params).subject,
    );
    expect(new Set(subjects).size).toBe(3);
  });

  it('escapes HTML in the game title', () => {
    const msg = submissionNotificationMessage('me@example.com', 'en', 'submission.published', {
      ...params,
      title: '<img src=x onerror=alert(1)>',
    });
    expect(msg.html).not.toContain('<img src=x');
    expect(msg.html).toContain('&lt;img');
  });
});

describe('renderContactEmail', () => {
  it('includes the writer identity and escapes HTML in the body', () => {
    const email = renderContactEmail({
      name: 'Ada <script>',
      email: 'ada@example.com',
      message: 'Hello <b>there</b>\nSecond line',
    });
    expect(email.subject).toContain('Ada');
    expect(email.text).toContain('ada@example.com');
    expect(email.text).toContain('Second line');
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>there</b>');
    expect(email.html).toContain('&lt;b&gt;there&lt;/b&gt;');
    expect(email.html).toContain('<br>');
  });
});
