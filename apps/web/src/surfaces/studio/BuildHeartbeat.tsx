import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../../relativeTime.js';

// "Live, updated 3 minutes ago" — the build's pulse.
export function BuildHeartbeat({ at }: { at: number }) {
  const { t, i18n } = useTranslation();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="status-heartbeat">
      {t('statusView.updatedAgo', { time: formatRelativeTime(at, i18n.language) })}
    </span>
  );
}
