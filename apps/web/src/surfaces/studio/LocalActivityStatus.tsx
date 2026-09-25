import { useTranslation } from 'react-i18next';
import type { LocalActivity } from '@gamedevpl/contract';
import { useLocalActivity } from './useLocalActivity.js';
import './studio-connect-guide.css';

export function LocalActivityStatus({ token }: { token: string }) {
  const { activity, phase } = useLocalActivity(token);
  return <LocalActivitySummary activity={activity} phase={phase} />;
}

export function LocalActivitySummary({
  activity,
  phase,
}: {
  activity: LocalActivity | null;
  phase: LocalActivity['phase'] | 'offline' | null;
}) {
  const { t } = useTranslation();
  if (!activity || !phase) return null;
  return (
    <div className="connect-guide-wait" role="status">
      <strong>{t('localActivity.title', { agent: activity.agent })}</strong>
      <p>{t(`localActivity.${phase}`)}</p>
      <small>{t('localActivity.localOnly')}</small>
    </div>
  );
}
