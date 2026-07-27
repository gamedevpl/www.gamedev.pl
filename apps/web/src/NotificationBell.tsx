import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import {
  clearNotifications,
  fetchNotifications,
  markNotificationsRead,
  type AppNotification,
  type NotificationType,
} from './notificationsApi.js';
import { pushUiState, subscribeToPush, unsubscribeFromPush, type PushUiState } from './pushApi.js';
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
  const [push, setPush] = useState<PushUiState>({ show: false, subscribed: false, permission: 'default' });
  const [pushBusy, setPushBusy] = useState(false);
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

  // Resolve push opt-in state once the user is known (browser support + whether the
  // server has push configured + whether this browser is already subscribed).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void pushUiState().then((state) => {
      if (alive) setPush(state);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  // "Clear all" removes the whole list; the per-item × removes one. Both update
  // optimistically, then a refresh reconciles with the server.
  const clearAll = useCallback(async () => {
    setItems([]);
    try {
      await clearNotifications('all');
    } catch {
      // Best-effort — refresh reconciles either way.
    }
    void refresh();
  }, [refresh]);

  const dismissOne = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((n) => n.id !== id));
      try {
        await clearNotifications([id]);
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const togglePush = useCallback(async () => {
    setPushBusy(true);
    try {
      if (push.subscribed) {
        await unsubscribeFromPush();
      } else {
        await subscribeToPush();
      }
      setPush(await pushUiState());
    } catch {
      // Surface nothing intrusive — re-read state so the toggle reflects reality.
      setPush(await pushUiState());
    } finally {
      setPushBusy(false);
    }
  }, [push.subscribed]);

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
          <div className="notif-panel-head">
            <span>{t('notifications.title', { defaultValue: 'Notifications' })}</span>
            {items.length > 0 && (
              <button type="button" className="notif-clear" onClick={() => void clearAll()}>
                {t('notifications.clearAll', { defaultValue: 'Clear all' })}
              </button>
            )}
          </div>
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
                  <button
                    type="button"
                    className="notif-dismiss"
                    aria-label={t('notifications.dismiss', { defaultValue: 'Dismiss' })}
                    onClick={() => void dismissOne(n.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {push.show && (
            <div className="notif-push">
              {push.permission === 'denied' ? (
                <span className="notif-push-hint">
                  {t('notifications.push.blocked', {
                    defaultValue: 'Push is blocked in your browser settings.',
                  })}
                </span>
              ) : (
                <button
                  type="button"
                  className={push.subscribed ? 'notif-push-toggle is-on' : 'notif-push-toggle'}
                  onClick={() => void togglePush()}
                  disabled={pushBusy}
                >
                  {push.subscribed
                    ? t('notifications.push.on', { defaultValue: 'Push notifications on' })
                    : t('notifications.push.enable', { defaultValue: 'Enable push notifications' })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
