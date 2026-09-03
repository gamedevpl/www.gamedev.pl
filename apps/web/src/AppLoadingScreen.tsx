import { useTranslation } from 'react-i18next';
import { Mascot } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';
import { formatLoadBytes, type FetchProgress } from './fetchProgress.js';

export function AppLoadingScreen({
  onExit,
  progress,
}: {
  onExit?: () => void;
  progress?: FetchProgress | null;
} = {}) {
  const { t } = useTranslation();
  const total = progress?.total ?? null;
  const known = progress != null && total != null && total > 0;
  const percent = known ? Math.min(100, Math.round((progress.loaded / total) * 100)) : null;
  const sizeLabel = !progress
    ? null
    : known && total != null
      ? t('catalog.gameLoadingSize', {
          loaded: formatLoadBytes(progress.loaded),
          total: formatLoadBytes(total),
        })
      : progress.loaded > 0
        ? formatLoadBytes(progress.loaded)
        : null;

  return (
    <div className="app-loading-screen">
      {onExit ? (
        <button
          type="button"
          className="secondary-btn exit-btn app-loading-screen__exit"
          onClick={onExit}
          aria-label={t('catalog.exitPlayer', { defaultValue: 'Close' })}
        >
          <PixelIcon name="close" size={14} />
        </button>
      ) : null}
      <div className="app-loading-screen__content">
        <Mascot className="app-loading-screen__mascot" emotion="busy" size={72} title={t('header.logoAlt')} />
        <div className="app-loading-screen__logo">
          <span className="app-loading-screen__logo-main">gamedev</span>
          <span className="app-loading-screen__logo-tld">.pl</span>
        </div>
        {progress != null ? (
          <>
            <div
              className={`app-loading-screen__bar${percent == null ? ' is-indeterminate' : ''}`}
              role="progressbar"
              aria-label={t('catalog.gameLoading')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
            >
              <div
                className="app-loading-screen__bar-fill"
                style={percent == null ? undefined : { width: `${percent}%` }}
              />
            </div>
            <p className="app-loading-screen__status">
              {t('catalog.gameLoading')}
              {sizeLabel ? <span className="app-loading-screen__size">{sizeLabel}</span> : null}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
