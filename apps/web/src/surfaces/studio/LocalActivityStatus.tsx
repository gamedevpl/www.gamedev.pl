import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalActivity } from '@gamedevpl/contract';
export function LocalActivityStatus({ token }: { token: string }) {
  const { t } = useTranslation();
  const [activity, setActivity] = useState<LocalActivity | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    const poll = async () => {
      setNow(Date.now());
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch(`/api/me/studio/local-activity/${encodeURIComponent(token)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { activity: LocalActivity | null };
        if (!disposed) setActivity(body.activity);
      } catch {
        // Preserve the last observation and its age.
      } finally {
        clearTimeout(timeout);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10_000);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
    };
  }, [token]);
  if (!activity) return null;
  const terminal = ['ready', 'failed', 'stopped'].includes(activity.phase);
  const phase = !terminal && now - Date.parse(activity.at) > 45_000 ? 'offline' : activity.phase;
  return (
    <div className="connect-guide-wait" role="status">
      <strong>{t('localActivity.title', { agent: activity.agent })}</strong>
      <p>{t(`localActivity.${phase}`)}</p>
      <small>{t('localActivity.localOnly')}</small>
    </div>
  );
}
