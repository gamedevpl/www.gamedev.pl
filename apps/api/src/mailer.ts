// The mailer seam. Everything that sends email (beta invites now; notification
// emails later — see docs/notifications-plan.md) depends only on the `Mailer`
// interface, so the provider is swappable and tests never make a network call.
//
// Same discipline as the `Store` / `GoogleAuthVerifier` seams: a real
// implementation (Resend, over its HTTP API — SMTP is blocked on Cloud Run)
// plus an in-memory/console fake used in dev, in tests, and for `--dry-run`.

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always required — text-first is better for deliverability. */
  text: string;
  /** Optional HTML body. */
  html?: string;
  /**
   * Optional Reply-To. Contact-form mail uses this so a reply from admin@ goes
   * to the writer, not the noreply sender identity.
   */
  replyTo?: string;
  /** Extra headers, e.g. `List-Unsubscribe` for the recurring notification mails. */
  headers?: Record<string, string>;
}

export interface SendResult {
  /** Provider message id when available (Resend returns one; console fakes synthesize one). */
  id?: string;
  provider: string;
}

export interface Mailer {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

export class MailerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MailerError';
  }
}

/** Default sender: a dedicated subdomain so email experiments never touch the root domain's reputation. */
export const DEFAULT_MAIL_FROM = 'gamedev.pl <noreply@mail.gamedev.pl>';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendMailerOptions {
  apiKey: string;
  /** RFC 5322 from address, e.g. `gamedev.pl <noreply@mail.gamedev.pl>`. */
  from: string;
  /** Injectable for tests; defaults to the global fetch (Node 20+). */
  fetchImpl?: typeof fetch;
}

export class ResendMailer implements Mailer {
  readonly name = 'resend';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ResendMailerOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const res = await this.fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.opts.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        reply_to: message.replyTo,
        headers: message.headers,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Never include the outgoing body/recipient in the error — keep provider
      // errors terse so they don't leak PII into logs.
      throw new MailerError(`resend send failed with ${res.status}${body ? `: ${body}` : ''}`, res.status);
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: data.id, provider: 'resend' };
  }
}

/**
 * Fake mailer: records what would be sent and prints it. Used in dev and tests,
 * and by `beta:invite --dry-run` to preview an invitation without sending.
 */
export class ConsoleMailer implements Mailer {
  readonly name = 'console';
  readonly sent: EmailMessage[] = [];

  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(message: EmailMessage): Promise<SendResult> {
    this.sent.push(message);
    this.log(`[mailer:console] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    return { id: `console-${this.sent.length}`, provider: 'console' };
  }
}

/**
 * Pick a mailer from the environment. With `RESEND_API_KEY` set we send for
 * real; without it we degrade to the console fake rather than crash — the same
 * "degrade for availability, fail closed for security" posture the deploy
 * scripts use for optional secrets. Callers that require a real send (the invite
 * CLI) should check `mailer.name` and refuse to claim success on `console`.
 */
export function createMailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM;
  if (apiKey) {
    return new ResendMailer({ apiKey, from });
  }
  return new ConsoleMailer();
}
