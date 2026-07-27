import { useTranslation } from 'react-i18next';
import { Mascot } from './Mascot.js';

export function AppLoadingScreen() {
  const { t } = useTranslation();

  return (
    <div className="app-loading-screen">
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
