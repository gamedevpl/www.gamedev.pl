import { describe, expect, it, vi } from 'vitest';
import {
  ConsoleMailer,
  createMailerFromEnv,
  DEFAULT_MAIL_FROM,
  MailerError,
  ResendMailer,
  type EmailMessage,
} from './mailer.js';

const message: EmailMessage = {
  to: 'friend@example.com',
  subject: 'Hello',
  text: 'Body text',
  html: '<p>Body text</p>',
};

describe('ResendMailer', () => {
  it('POSTs to the Resend API with bearer auth and the from address', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'resend-123' }), { status: 200 }));
    const mailer = new ResendMailer({ apiKey: 'key_abc', from: DEFAULT_MAIL_FROM, fetchImpl });

    const result = await mailer.send(message);

    expect(result).toEqual({ id: 'resend-123', provider: 'resend' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer key_abc');
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      from: DEFAULT_MAIL_FROM,
      to: 'friend@example.com',
      subject: 'Hello',
      text: 'Body text',
      html: '<p>Body text</p>',
    });
  });

  it('forwards replyTo as reply_to for the Resend API', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'resend-456' }), { status: 200 }));
    const mailer = new ResendMailer({ apiKey: 'key_abc', from: DEFAULT_MAIL_FROM, fetchImpl });

    await mailer.send({ ...message, replyTo: 'writer@example.com' });

    const body = JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string);
    expect(body.reply_to).toBe('writer@example.com');
  });

  it('throws MailerError carrying the status on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }));
    const mailer = new ResendMailer({ apiKey: 'key_abc', from: DEFAULT_MAIL_FROM, fetchImpl });

    await expect(mailer.send(message)).rejects.toMatchObject({
      name: 'MailerError',
      status: 429,
    });
    await expect(mailer.send(message)).rejects.toBeInstanceOf(MailerError);
  });

  it('does not leak the recipient into the error message', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }));
    const mailer = new ResendMailer({ apiKey: 'key_abc', from: DEFAULT_MAIL_FROM, fetchImpl });

    await expect(mailer.send(message)).rejects.toThrow(/resend send failed with 400/);
    await expect(mailer.send(message)).rejects.not.toThrow(/friend@example.com/);
  });
});

describe('ConsoleMailer', () => {
  it('records the message and returns a synthesized id without any network call', async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer((line) => lines.push(line));

    const result = await mailer.send(message);

    expect(result).toEqual({ id: 'console-1', provider: 'console' });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toEqual(message);
    expect(lines[0]).toContain('friend@example.com');
  });
});

describe('createMailerFromEnv', () => {
  it('returns a ResendMailer when RESEND_API_KEY is set', () => {
    const mailer = createMailerFromEnv({ RESEND_API_KEY: 'key_abc' } as NodeJS.ProcessEnv);
    expect(mailer.name).toBe('resend');
  });

  it('degrades to ConsoleMailer when no key is present', () => {
    const mailer = createMailerFromEnv({} as NodeJS.ProcessEnv);
    expect(mailer.name).toBe('console');
  });

  it('treats a blank key as absent (degrades to console)', () => {
    const mailer = createMailerFromEnv({ RESEND_API_KEY: '   ' } as NodeJS.ProcessEnv);
    expect(mailer.name).toBe('console');
  });
});
