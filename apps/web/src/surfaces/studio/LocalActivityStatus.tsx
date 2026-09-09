import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalActivity } from '@gamedevpl/contract';
import { LOCAL_ACTIVITY_TERMINAL, nextLocalActivityDelay } from './localActivityPoll.js';

export function LocalActivityStatus({ token }: { token: string }) {
  const { t } = useTranslation();
  const [activity, setActivity] = useState<LocalActivity | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let empty = 0;
    let latest: LocalActivity | null = null;

    const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

    const schedule = (): void => {
      if (disposed || hidden()) return;
      timer = setTimeout(() => void poll(), nextLocalActivityDelay(latest, empty));
    };

    const poll = async (): Promise<void> => {
      if (disposed || hidden()) return;
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
        latest = body.activity;
        empty = body.activity ? 0 : empty + 1;
        if (!disposed) setActivity(body.activity);
      } catch {
        // Preserve the last observation and its age.
      } finally {
        clearTimeout(timeout);
        schedule();
      }
    };

    // A tab coming back asks at once, at the fast cadence.
    const onVisible = (): void => {
      if (hidden()) {
        clearTimeout(timer);
        return;
      }
      empty = 0;
      clearTimeout(timer);
      void poll();
    };

    void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token]);
  if (!activity) return null;
  const terminal = LOCAL_ACTIVITY_TERMINAL.includes(activity.phase);
  const phase = !terminal && now - Date.parse(activity.at) > 45_000 ? 'offline' : activity.phase;
  return (
    <div className="connect-guide-wait" role="status">
      <strong>{t('localActivity.title', { agent: activity.agent })}</strong>
      <p>{t(`localActivity.${phase}`)}</p>
      <small>{t('localActivity.localOnly')}</small>
    </div>
  );
}
