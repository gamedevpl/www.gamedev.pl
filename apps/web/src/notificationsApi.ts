// Client for the notification read API (docs/notifications-plan.md N3). Same-origin
// in production; the session cookie authenticates. `credentials: 'include'` keeps
// it working through the Vite dev proxy too.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type NotificationType = 'submission.building' | 'submission.published' | 'submission.needs_changes';

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
