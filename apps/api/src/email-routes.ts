// Public email endpoints (docs/notifications-plan.md). The unsubscribe link must
// work from a mail client on a device that never signed in, so it takes a signed
// token instead of a session and is exempt from the private-beta wall (see app.ts).

import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
import { InvalidUnsubscribeTokenError, verifyUnsubscribeToken } from './unsubscribe-token.js';

export interface EmailRoutesOptions {
  store: Store;
  /** Secret for unsubscribe tokens; defaults to SESSION_SECRET (always set in prod). */
  unsubscribeSecret?: string;
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;line-height:1.5;color:#1a1d24}
a{color:#0a7d76}</style></head>
<body><h1>${title}</h1><p>${body}</p><p><a href="https://www.gamedev.pl">Back to gamedev.pl</a></p></body></html>`;
}

export async function registerEmailRoutes(app: FastifyInstance, options: EmailRoutesOptions): Promise<void> {
  const secret = options.unsubscribeSecret ?? process.env.SESSION_SECRET;

  app.get('/api/email/unsubscribe', async (request, reply) => {
    const token = (request.query as { token?: string }).token;
    if (!secret || !token) {
      return reply.type('text/html').status(400).send(page('Invalid link', 'This unsubscribe link is not valid.'));
    }

    let uid: string;
    try {
      uid = verifyUnsubscribeToken(token, secret);
    } catch (error) {
      if (error instanceof InvalidUnsubscribeTokenError) {
        return reply
          .type('text/html')
          .status(400)
          .send(page('Invalid link', 'This unsubscribe link is invalid or has expired.'));
      }
      throw error;
    }

    await options.store.setEmailUnsubscribed(uid, new Date().toISOString());
    return reply
      .type('text/html')
      .send(
        page(
          'Unsubscribed',
          'You will no longer receive email from gamedev.pl. You can still see updates in the app’s notification bell.',
        ),
      );
  });
}
