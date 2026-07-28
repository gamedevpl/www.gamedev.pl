// Client for the notification read API (docs/notifications-plan.md N3). Same-origin
// in production; the session cookie authenticates. `credentials: 'include'` keeps
// it working through the Vite dev proxy too.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type NotificationType =
  | 'submission.building'
  | 'submission.published'
  | 'submission.needs_changes'
  /** The weekly summary of how a creator's games are doing. */
  | 'creator.digest';

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  emailedAt: string | null;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  link: string;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await fetch(`${API_BASE}/api/notifications`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Notifications request failed (${res.status})`);
  }
  const body = (await res.json()) as { notifications?: unknown };
  return Array.isArray(body.notifications) ? (body.notifications as AppNotification[]) : [];
}

export async function markNotificationsRead(target: string[] | 'all'): Promise<void> {
  await fetch(`${API_BASE}/api/notifications/read`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(target === 'all' ? { all: true } : { ids: target }),
  });
}

/** Delete notifications — a list of ids (per-item dismiss) or 'all' (clear all). */
export async function clearNotifications(target: string[] | 'all'): Promise<void> {
  await fetch(`${API_BASE}/api/notifications/clear`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(target === 'all' ? { all: true } : { ids: target }),
  });
}

/** What this account has chosen to receive. `true` means "send it". */
export type NotificationPreferences = {
  /** The weekly summary of how the creator's games are doing. */
  digest: boolean;
  /** Notification email in general; `false` is the one-click unsubscribe. */
  email: boolean;
};

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await fetch(`${API_BASE}/api/me/notification-preferences`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as NotificationPreferences;
}

/**
 * Updates only the switches named. Omitting one leaves it as it is, so this client cannot
 * reset a preference it does not know about.
 */
export async function updateNotificationPreferences(
  changes: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const response = await fetch(`${API_BASE}/api/me/notification-preferences`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as NotificationPreferences;
}
