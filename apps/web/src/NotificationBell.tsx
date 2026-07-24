import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import {
  fetchNotifications,
  markNotificationsRead,
  type AppNotification,
  type NotificationType,
} from './notificationsApi';
import './NotificationBell.css';

const POLL_MS = 60_000;

// English fallbacks used until locale keys land in i18n/locales/*.json. Rendering
// through t(key, { defaultValue }) means the component localizes automatically
// once those keys exist — no change here.
const FALLBACK: Record<NotificationType, { title: string; body: string }> = {
  'submission.published': { title: 'Your game is live!', body: '“{{title}}” is published — tap to play.' },
  'submission.building': { title: 'Your game is building', body: 'Work has started on “{{title}}”.' },
  'submission.needs_changes': { title: 'Your submission needs changes', body: '“{{title}}” needs another look.' },
};

export function NotificationBell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unread = items.filter((n) => n.readAt === null).length;

  const refresh = useCallback(async () => {
    try {
      setItems(await fetchNotifications());
    } catch {
      // Silent: the bell is ambient. A failed poll keeps the last-good list.
    }
  }, []);

  // Fetch on sign-in and on a slow poll while the tab is visible (no websocket).
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [user, refresh]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Opening clears the unread badge — optimistically locally, then server-side.
    if (next && unread > 0) {
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
      void markNotificationsRead('all');
    }
  };

  return (
    <div className="notif" ref={containerRef}>
      <button
        type="button"
        className="notif-trigger"
        aria-label={t('notifications.aria', { defaultValue: 'Notifications' })}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-5-1.6-1.6V10a5.4 5.4 0 0 0-4-5.22V4a1.4 1.4 0 0 0-2.8 0v.78A5.4 5.4 0 0 0 6.6 10v5.4L5 17a.9.9 0 0 0 .64 1.54h12.72A.9.9 0 0 0 19 17Z"
          />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="menu">
          <div className="notif-panel-head">{t('notifications.title', { defaultValue: 'Notifications' })}</div>
          {items.length === 0 ? (
            <div className="notif-empty">{t('notifications.empty', { defaultValue: 'Nothing yet.' })}</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id} className={n.readAt ? 'notif-item' : 'notif-item is-unread'}>
                  <a href={n.link} className="notif-link" onClick={() => setOpen(false)}>
                    <span className="notif-item-title">
                      {t(n.titleKey, { ...n.params, defaultValue: FALLBACK[n.type]?.title ?? 'Update' })}
                    </span>
                    <span className="notif-item-body">
                      {t(n.bodyKey, { ...n.params, defaultValue: FALLBACK[n.type]?.body ?? '' })}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
