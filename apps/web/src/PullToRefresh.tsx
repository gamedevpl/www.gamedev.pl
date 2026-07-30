/**
 * Visible half of pull-to-refresh: a slim indicator that grows under the sticky
 * header as the visitor pulls, then spins while the home catalog soft-refreshes.
 *
 * The gesture itself lives in {@link usePullToRefresh}; this is only the chrome.
 * Hidden while idle so it costs nothing on every other visit.
 */

import { useTranslation } from 'react-i18next';
import { usePullToRefresh } from './usePullToRefresh.js';

export type PullToRefreshProps = {
  /** When false (game open, non-home route, …) the gesture is inert. */
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
};

export function PullToRefresh({ enabled, onRefresh }: PullToRefreshProps) {
  const { t } = useTranslation();
  const { status, pullDistance } = usePullToRefresh({ enabled, onRefresh });

  if (status === 'idle' && pullDistance === 0) return null;

  const label =
    status === 'refreshing' ? t('pwa.pullRefreshing') : status === 'ready' ? t('pwa.pullRelease') : t('pwa.pullHint');

  return (
    <div
      className={`pull-to-refresh${status === 'refreshing' ? ' pull-to-refresh--busy' : ''}${status === 'ready' ? ' pull-to-refresh--ready' : ''}`}
      style={{ height: Math.max(pullDistance, status === 'refreshing' ? 48 : 0) }}
      role="status"
      aria-live="polite"
      aria-busy={status === 'refreshing'}
    >
      <div className="pull-to-refresh__inner">
        <span className="pull-to-refresh__spinner" aria-hidden="true" />
        <span className="pull-to-refresh__label">{label}</span>
      </div>
    </div>
  );
}
