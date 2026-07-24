// Notification emission (docs/notifications-plan.md). One idempotent entry point
// that both detection paths converge on — the Cloud Scheduler sweep and the
// opportunistic detection on a browser status poll — so double-detection is a
// no-op. Writes an in-app notification now; email fan-out (M1.5) will slot in
// here alongside the unsubscribe path, which is why the store already carries the
// emailedAt column.

import type { NotificationType, Store } from './store.js';

const SHORT_TYPE: Record<NotificationType, string> = {
  'submission.building': 'building',
  'submission.published': 'published',
  'submission.needs_changes': 'needs-changes',
};

export interface EmitDeps {
  store: Store;
  now?: () => number;
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

  const { created } = await deps.store.createNotification(event.uid, {
    id,
    type: event.type,
    createdAt: now,
    titleKey: `notifications.${event.type}.title`,
    bodyKey: `notifications.${event.type}.body`,
    params: { title: event.gameTitle },
    link,
  });

  return { created };
}
