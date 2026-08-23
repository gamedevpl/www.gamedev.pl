// The push seam (docs/notifications-plan.md M2, N4c). Everything that delivers a
// Web Push message depends only on the `Pusher` interface, so the transport is
// swappable and tests never make a network call — the same discipline as the
// `Mailer` / `Store` / `GoogleAuthVerifier` seams.
//
// Scope note (M2 "80/20" slice): this targets desktop Chrome/Firefox/Edge and
// Android. iOS Safari needs a home-screen-installed PWA to receive push, which is
// deliberately out of scope here — the send path is identical, so adding it later
// is client + manifest work only, no change to this file.

import webpush from 'web-push';

// The browser's PushSubscription, as serialized by `subscription.toJSON()` on the
// client and stored verbatim. `web-push` accepts exactly this shape.
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  /** Absolute in-app URL the notificationclick handler opens, e.g. `https://…/play/slug`. */
  url: string;
  /** Stable tag so re-notifying the same event coalesces instead of stacking. */
  tag: string;
}

// A send either succeeds, fails transiently (retry next sweep), or the endpoint is
// permanently gone (404/410) — the caller prunes the stored subscription on `gone`.
export type PushSendResult = { outcome: 'sent' } | { outcome: 'gone' } | { outcome: 'error'; status?: number };

export interface Pusher {
  readonly name: string;
  send(subscription: PushSubscriptionJSON, payload: PushPayload): Promise<PushSendResult>;
}

export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  /** VAPID subject: a `mailto:` or `https:` contact the push service can reach. */
  subject: string;
  /** Injectable for tests; defaults to `web-push`'s sendNotification. */
  sendImpl?: typeof webpush.sendNotification;
}

/**
 * Real Web Push over the browser push services (FCM / Mozilla / Apple). Uses
 * outbound HTTPS, which Cloud Run permits — the same reason email goes over
 * Resend's HTTP API rather than SMTP. `web-push` handles VAPID signing and the
 * ECDH payload encryption; we never touch raw crypto.
 */
export class WebPushPusher implements Pusher {
  readonly name = 'web-push';
  private readonly sendImpl: typeof webpush.sendNotification;

  constructor(private readonly config: WebPushConfig) {
    this.sendImpl = config.sendImpl ?? webpush.sendNotification.bind(webpush);
  }

  async send(subscription: PushSubscriptionJSON, payload: PushPayload): Promise<PushSendResult> {
    try {
      await this.sendImpl(subscription, JSON.stringify(payload), {
        vapidDetails: {
          subject: this.config.subject,
          publicKey: this.config.publicKey,
          privateKey: this.config.privateKey,
        },
      });
      return { outcome: 'sent' };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404 Not Found / 410 Gone: the subscription is dead (browser cleared it,
      // user reset permissions). Signal the caller to prune it.
      if (status === 404 || status === 410) {
        return { outcome: 'gone' };
      }
      return { outcome: 'error', status };
    }
  }
}

/** Fake pusher: records what would be sent. Used in dev and tests. */
export class NoopPusher implements Pusher {
  readonly name = 'noop';
  readonly sent: Array<{ subscription: PushSubscriptionJSON; payload: PushPayload }> = [];

  async send(subscription: PushSubscriptionJSON, payload: PushPayload): Promise<PushSendResult> {
    this.sent.push({ subscription, payload });
    return { outcome: 'sent' };
  }
}

/**
 * Pick a pusher from the environment. With a full VAPID keypair we send for real;
 * otherwise push is simply off (returns undefined) — the same "degrade for
 * availability" posture as the mailer, so a deploy without keys stays green and
 * push is dark until the secret exists.
 */
export function createPusherFromEnv(env: NodeJS.ProcessEnv = process.env): Pusher | undefined {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return undefined;
  const subject = env.VAPID_SUBJECT?.trim() || 'mailto:noreply@mail.gamedev.pl';
  return new WebPushPusher({ publicKey, privateKey, subject });
}
