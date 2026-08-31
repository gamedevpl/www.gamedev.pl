import { useTranslation } from 'react-i18next';
import { Mascot } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';

export function AppLoadingScreen({ onExit }: { onExit?: () => void } = {}) {
  const { t } = useTranslation();

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
      </div>
    </div>
  );
}
