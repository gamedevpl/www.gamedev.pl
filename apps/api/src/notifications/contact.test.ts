import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { ConsoleMailer, MailerError } from './mailer.js';
import { InMemoryStore } from '../store.js';

const sessionSecret = 'contact-test-secret';

function validPayload(overrides: Partial<{ name: string; email: string; message: string }> = {}) {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'Hello — I have a question about the closed beta.',
    ...overrides,
  };
}

describe('POST /api/contact', () => {
  it('sends mail to admin@gamedev.pl with Reply-To set to the writer', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer },
    });

    const res = await app.inject({ method: 'POST', url: '/api/contact', payload: validPayload() });

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: 'admin@gamedev.pl',
      replyTo: 'ada@example.com',
      subject: 'Contact form: Ada Lovelace',
    });
    expect(mailer.sent[0]!.text).toContain('Hello — I have a question about the closed beta.');
    await app.close();
  });

  it('rejects a missing or short message with 400', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: validPayload({ message: 'hi' }),
    });
    expect(res.statusCode).toBe(400);
    expect(mailer.sent).toHaveLength(0);
    await app.close();
  });

  it('rejects an invalid email with 400', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: validPayload({ email: 'not-an-email' }),
    });
    expect(res.statusCode).toBe(400);
    expect(mailer.sent).toHaveLength(0);
    await app.close();
  });

  it('allows a phone number in the body (contact PII is expected)', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: validPayload({ message: 'Please call me back at +48 512 345 678 when you can.' }),
    });
    expect(res.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(1);
    await app.close();
  });

  it('rejects abusive content with 422', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: validPayload({ message: 'This is a fucking insult, nothing more to say here.' }),
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'content_rejected' });
    expect(mailer.sent).toHaveLength(0);
    await app.close();
  });

  it('rejects markdown-wrapped link floods that sanitization would otherwise hide', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: validPayload({
        message: 'See [a](https://a.example.com) and [b](https://b.example.com) and [c](https://c.example.com) please.',
      }),
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'content_rejected' });
    expect(mailer.sent).toHaveLength(0);
    await app.close();
  });

  it('rate-limits a flood from one address', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer },
    });

    for (let i = 0; i < 5; i++) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/contact',
        payload: validPayload({ message: `Message number ${i} with enough length.` }),
        remoteAddress: '203.0.113.50',
      });
      expect(ok.statusCode).toBe(202);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: validPayload({ message: 'One more message that should be blocked now.' }),
      remoteAddress: '203.0.113.50',
    });
    expect(blocked.statusCode).toBe(429);
    await app.close();
  });

  it('returns 502 when the mailer fails', async () => {
    const failing = {
      name: 'failing',
      async send() {
        throw new MailerError('provider down', 500);
      },
    };
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      contactRoutes: { mailer: failing },
    });

    const res = await app.inject({ method: 'POST', url: '/api/contact', payload: validPayload() });
    expect(res.statusCode).toBe(502);
    await app.close();
  });

  it('stays reachable through the private-beta wall without a session', async () => {
    const mailer = new ConsoleMailer(() => {});
    const app = await buildApp({
      store: new InMemoryStore(),
      sessionSecret,
      betaAllowedUids: 'nobody',
      contactRoutes: { mailer },
    });

    const res = await app.inject({ method: 'POST', url: '/api/contact', payload: validPayload() });
    expect(res.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(1);
    await app.close();
  });
});
