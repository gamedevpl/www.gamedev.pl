import { useTranslation } from 'react-i18next';
import type { AppNotification, NotificationType } from './notificationsApi.js';

// Operator alerts point at the removed /admin; the ops console handles them.
function isOperatorNotice(n: AppNotification): boolean {
  return n.type.startsWith('operator.');
}

// English fallbacks until locale keys exist; t() switches over automatically.
const FALLBACK: Record<NotificationType, { title: string; body: string }> = {
  'submission.published': { title: 'Your game is live!', body: '“{{title}}” is published — tap to play.' },
  'submission.building': { title: 'Your game is building', body: 'Work has started on “{{title}}”.' },
  'submission.needs_changes': { title: 'Your submission needs changes', body: '“{{title}}” needs another look.' },
  'creator.digest': {
    title: 'Your games this week',
    body: 'Sessions: {{sessions}} · Games: {{games}} · {{votesUp}}👍 {{votesDown}}👎 · Notes from players: {{feedback}}',
  },
  'share.offered': { title: 'You were invited to edit a game', body: '{{actorName}} invited you to edit “{{title}}”.' },
  'share.accepted': { title: 'An editor joined your game', body: '{{actorName}} accepted the invite for “{{title}}”.' },
  'share.removed': { title: 'You were removed from a game', body: '{{actorName}} removed you from “{{title}}”.' },
  'share.left': { title: 'An editor left your game', body: '{{actorName}} left “{{title}}”.' },
};

// One bell row: link (operator alerts: plain text) plus dismiss.
export function NotificationItem({
  n,
  onNavigate,
  onDismiss,
}: {
  n: AppNotification;
  onNavigate: () => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  const text = (
    <>
      <span className="notif-item-title">
        {t(n.titleKey, { ...n.params, defaultValue: FALLBACK[n.type]?.title ?? 'Update' })}
      </span>
      <span className="notif-item-body">
        {t(n.bodyKey, { ...n.params, defaultValue: FALLBACK[n.type]?.body ?? '' })}
      </span>
    </>
  );
  return (
    <li className={n.readAt ? 'notif-item' : 'notif-item is-unread'}>
      {isOperatorNotice(n) ? (
        <div className="notif-link is-static">{text}</div>
      ) : (
        <a href={n.link} className="notif-link" onClick={onNavigate}>
          {text}
        </a>
      )}
      <button
        type="button"
        className="notif-dismiss"
        aria-label={t('notifications.dismiss', { defaultValue: 'Dismiss' })}
        onClick={() => onDismiss(n.id)}
      >
        ×
      </button>
    </li>
  );
}
