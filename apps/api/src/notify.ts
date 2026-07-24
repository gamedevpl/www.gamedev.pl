// Notification emission (docs/notifications-plan.md). One idempotent entry point
// that both detection paths converge on — the Cloud Scheduler sweep and the
// opportunistic detection on a browser status poll — so double-detection is a
// no-op. Writes an in-app notification now; email fan-out (M1.5) will slot in
// here alongside the unsubscribe path, which is why the store already carries the
// emailedAt column.

import { normalizeLocale, submissionNotificationMessage } from './email-templates.js';
import type { Mailer } from './mailer.js';
import type { NotificationType, StoredNotification, SubmissionRecord, Store } from './store.js';
import type { SubmissionPublishedResponse, SubmissionStatus, SubmissionStatusResponse } from './submission-status.js';
import { mintUnsubscribeToken } from './unsubscribe-token.js';

const SHORT_TYPE: Record<NotificationType, string> = {
  'submission.building': 'building',
  'submission.published': 'published',
  'submission.needs_changes': 'needs-changes',
};

// Which derived statuses are worth a notification, and as which event. queued,
// publishing, and (deliberately) in_review-vs-building share one "it's building"
// event so a WIP→ready flip doesn't double-notify. Idempotent ids back this up.
const STATUS_TO_EVENT: Partial<Record<SubmissionStatus, NotificationType>> = {
  building: 'submission.building',
  in_review: 'submission.building',
  published: 'submission.published',
  needs_changes: 'submission.needs_changes',
};

export function statusToEvent(status: SubmissionStatus): NotificationType | null {
  return STATUS_TO_EVENT[status] ?? null;
}

export interface EmitDeps {
  store: Store;
  now?: () => number;
  /** When set (with unsubscribeSecret), notifications also fan out to email. */
  mailer?: Mailer;
  /** Absolute origin used to build email links, e.g. https://www.gamedev.pl */
  appBaseUrl?: string;
  /** Secret for signing the one-click unsubscribe token. */
  unsubscribeSecret?: string;
  /** Optional logger for best-effort email failures (they're retried next sweep). */
  logError?: (err: unknown, msg: string) => void;
}

/**
 * Best-effort notification email. Skips silently when email isn't configured, the
 * user has no address or has unsubscribed, or the notification was already emailed.
 * A send failure leaves emailedAt null so the next sweep retries. Never throws.
 */
async function maybeSendEmail(deps: EmitDeps, uid: string, notification: StoredNotification): Promise<void> {
  if (!deps.mailer || !deps.unsubscribeSecret) return;
  if (notification.emailedAt) return;
  try {
    const user = await deps.store.getUser(uid);
    if (!user?.email || user.emailUnsubscribedAt) return;

    const appBaseUrl = deps.appBaseUrl ?? 'https://www.gamedev.pl';
    const actionUrl = `${appBaseUrl}/${notification.link}`;
    const unsubscribeUrl = `${appBaseUrl}/api/email/unsubscribe?token=${mintUnsubscribeToken(uid, deps.unsubscribeSecret)}`;
    const message = submissionNotificationMessage(user.email, normalizeLocale(user.locale), notification.type, {
      title: notification.params.title ?? '',
      actionUrl,
      unsubscribeUrl,
    });

    await deps.mailer.send(message);
    await deps.store.markNotificationEmailed(uid, notification.id);
  } catch (err) {
    deps.logError?.(err, 'notification email send failed');
  }
}

export interface SubmissionNotificationEvent {
  /** Owner of the submission — the notification recipient. */
  uid: string;
  type: NotificationType;
  issueNumber: number;
  /** Sanitized game title, shown in the notification text. */
  gameTitle: string;
  /** Status-page share token — the default deep link. */
  statusToken: string;
  /** Present for `submission.published`: deep-link straight to the playable game. */
  slug?: string;
}

/**
 * Emit a creator submission notification. Idempotent by a deterministic id
 * (`sub-<issue>-<event>`), so the sweep can re-run and the poll path can race it
 * without producing duplicates. Returns whether a new notification was created.
 */
export async function emitSubmissionNotification(
  deps: EmitDeps,
  event: SubmissionNotificationEvent,
): Promise<{ created: boolean }> {
  const id = `sub-${event.issueNumber}-${SHORT_TYPE[event.type]}`;
  const now = deps.now ? new Date(deps.now()).toISOString() : new Date().toISOString();

  // Published games deep-link to play; everything else to the status page.
  const link =
    event.type === 'submission.published' && event.slug ? `#/play/${event.slug}` : `#/status/${event.statusToken}`;

  const { created, notification } = await deps.store.createNotification(event.uid, {
    id,
    type: event.type,
    createdAt: now,
    titleKey: `notifications.${event.type}.title`,
    bodyKey: `notifications.${event.type}.body`,
    params: { title: event.gameTitle },
    link,
  });

  // Fan out to email (best effort, idempotent via emailedAt). Runs on a fresh
  // notification and also retries one whose earlier send failed (emailedAt null).
  await maybeSendEmail(deps, event.uid, notification);

  return { created };
}

/**
 * The transition gate both detection paths share: given a submission's record and
 * its freshly-derived status, emit the mapped event iff the event changed since
 * `lastNotifiedStatus`, then record the new status. Returns whether it emitted.
 * `statusToken` is the recipient's status-page link (the poll path already has it;
 * the sweep mints one).
 */
export async function notifyOnTransition(
  deps: EmitDeps,
  submission: Pick<SubmissionRecord, 'issueNumber' | 'ownerUid' | 'title' | 'lastNotifiedStatus'>,
  status: SubmissionStatusResponse,
  statusToken: string,
): Promise<{ emitted: boolean }> {
  const event = statusToEvent(status.status);
  if (!event) return { emitted: false };

  const prevEvent = submission.lastNotifiedStatus ? statusToEvent(submission.lastNotifiedStatus) : null;
  if (prevEvent === event) return { emitted: false };

  await emitSubmissionNotification(deps, {
    uid: submission.ownerUid,
    type: event,
    issueNumber: submission.issueNumber,
    gameTitle: submission.title,
    statusToken,
    slug: status.status === 'published' ? (status as SubmissionPublishedResponse).slug : undefined,
  });
  await deps.store.setSubmissionNotifiedStatus(submission.issueNumber, status.status);
  return { emitted: true };
}
