import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { playHandoffHref, recordFramedPlayStep } from './visitTelemetry.js';
import './FramedPlayInterstitial.css';

export function FramedPlayInterstitial({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const href = playHandoffHref(slug, window.location.search);

  useEffect(() => {
    recordFramedPlayStep('shown');
  }, []);

  return (
    <main className="beta-splash framed-play">
      <div className="beta-splash__card">
        <div className="beta-splash__logo">
          <span className="beta-splash__logo-main">gamedev</span>
          <span className="beta-splash__logo-tld">.pl</span>
        </div>
        <h1 className="beta-splash__headline">{t('framedPlay.headline')}</h1>
        <p className="beta-splash__sub">{t('framedPlay.sub')}</p>
        <div className="beta-splash__waitlist">
          <a
            className="beta-splash__waitlist-btn"
            href={href}
            target="_blank"
            rel="noopener"
            onClick={() => recordFramedPlayStep('open_new')}
          >
            {t('framedPlay.openNew')}
          </a>
          <a
            className="framed-play__open-top"
            href={href}
            target="_top"
            onClick={() => recordFramedPlayStep('open_here')}
          >
            {t('framedPlay.openHere')}
          </a>
        </div>
      </div>
    </main>
  );
}
