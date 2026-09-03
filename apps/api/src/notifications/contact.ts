import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { renderContactEmail } from './email-templates.js';
import { createMailerFromEnv, type Mailer } from './mailer.js';
import { moderateFields } from '../platform/moderation.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import { logModerationRejection } from '../platform/moderation-metrics.js';

/**
 * Public contact form → transactional email to the published operator address
 * (`admin@gamedev.pl`). Anonymous on purpose: the footer Contact link is reachable
 * without a session (same posture as Terms / Privacy), and a mailbox that only
 * signed-in beta users can reach is not a published contact point.
 *
 * Abuse surface is closed with IP rate limits, length caps, deny-list moderation
 * (PII allowed — a contact body is expected to name a person), and sanitization
 * before the body is rendered into the outbound mail.
 */

/** Matches apps/web/src/legal/operator.ts `CONTACT_EMAIL` — the DSA/GDPR contact. */
export const DEFAULT_CONTACT_TO = 'admin@gamedev.pl';

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_NAME_LENGTH = 100;

const ContactRequestSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(MAX_NAME_LENGTH, 'name is too long'),
  email: z.string().trim().email('email is invalid').max(254, 'email is too long'),
  message: z
    .string()
    .trim()
    .min(MIN_MESSAGE_LENGTH, `message must be at least ${MIN_MESSAGE_LENGTH} characters`)
    .max(MAX_MESSAGE_LENGTH, `message must be at most ${MAX_MESSAGE_LENGTH} characters`),
});

export interface ContactRoutesOptions {
  mailer?: Mailer;
  /** Override the inbound mailbox; defaults to admin@gamedev.pl. */
  contactTo?: string;
  now?: () => number;
}

/** Sliding-window per-IP limiter, same shape as player-feedback / submissions. */
function isRateLimited(
  buckets: Map<string, number[]>,
  ip: string,
  currentTime: number,
  maxRequests: number,
  windowMs: number,
): boolean {
  const requests = (buckets.get(ip) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
  if (requests.length >= maxRequests) {
    buckets.set(ip, requests);
    return true;
  }
  requests.push(currentTime);
  buckets.set(ip, requests);
  return false;
}

export async function registerContactRoutes(app: FastifyInstance, options: ContactRoutesOptions = {}): Promise<void> {
  const mailer = options.mailer ?? createMailerFromEnv();
  const contactTo = options.contactTo?.trim() || DEFAULT_CONTACT_TO;
  const now = options.now ?? Date.now;

  const rateLimitWindowMs = 60 * 60 * 1000;
  const maxPerWindow = 5;
  const byIp = new Map<string, number[]>();

  app.post(
    '/api/contact',
    { config: { rateLimit: { max: maxPerWindow, timeWindow: rateLimitWindowMs } } },
    async (request, reply) => {
      const parsed = ContactRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      const sanitizedName = sanitizeCreatorText(parsed.data.name, { singleLine: true });
      const sanitizedMessage = sanitizeCreatorText(parsed.data.message, { singleLine: false });
      if (sanitizedName.length < 1) {
        return reply.status(400).send({ error: 'name is required' });
      }
      if (sanitizedMessage.length < MIN_MESSAGE_LENGTH) {
        return reply.status(400).send({ error: `message must be at least ${MIN_MESSAGE_LENGTH} characters` });
      }

      // Abuse categories only — writers are allowed (expected) to leave a phone or
      // a second address in the body. The reply address lives in its own field.
      //
      // Moderate raw *and* sanitized when they differ (same posture as player
      // feedback): raw still carries markdown link targets for the URL-count check;
      // sanitized is what the outbound mail actually contains, and stripping
      // emphasis can reveal a blocked term the raw form hid (`sh*it` → `shit`).
      const nameFields = sanitizedName === parsed.data.name ? [sanitizedName] : [parsed.data.name, sanitizedName];
      const messageFields =
        sanitizedMessage === parsed.data.message ? [sanitizedMessage] : [parsed.data.message, sanitizedMessage];
      const moderation = moderateFields([...nameFields, ...messageFields], { allowPii: true });
      if (!moderation.allowed) {
        // No uid: the contact form is deliberately outside the beta wall, so most writers
        // have no session. Recorded as `anonymous` rather than skipped — a rejection here is
        // exactly as interesting as one from a signed-in creator, and arguably more, since
        // this is the only moderated surface an unauthenticated stranger can reach.
        logModerationRejection(request.log, {
          surface: 'contact',
          uid: request.user?.uid,
          category: moderation.category,
        });
        return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
      }

      if (isRateLimited(byIp, request.clientIp, now(), maxPerWindow, rateLimitWindowMs)) {
        return reply.status(429).send({ error: 'too many contact requests, please try again later' });
      }

      const rendered = renderContactEmail({
        name: sanitizedName,
        email: parsed.data.email,
        message: sanitizedMessage,
      });

      try {
        await mailer.send({
          to: contactTo,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          replyTo: parsed.data.email,
        });
      } catch (error) {
        request.log.error({ err: error }, 'failed to send contact email');
        return reply.status(502).send({ error: 'failed to send message' });
      }

      return reply.status(202).send({ status: 'ok' });
    },
  );
}
