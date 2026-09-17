import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAIL_FROM, ResendMailer, type EmailMessage } from './mailer.js';

describe('ResendMailer idempotency header', () => {
  it('forwards idempotency key as the API header', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'resend-789' }), { status: 200 }));
    const mailer = new ResendMailer({ apiKey: 'key_abc', from: DEFAULT_MAIL_FROM, fetchImpl });
    const message: EmailMessage = { to: 'friend@example.com', subject: 'Hello', text: 'Body text' };

    await mailer.send(message, { idempotencyKey: 'notify:g:boss:sub-7' });

    expect((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'notify:g:boss:sub-7',
    );
  });
});
