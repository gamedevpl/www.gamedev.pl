import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Mascot } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';
import { recordBetaWelcomeStep } from './visitTelemetry.js';

export function BetaWelcomeSplash({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    recordBetaWelcomeStep('shown');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      recordBetaWelcomeStep('dismissed');
      onContinue();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onContinue]);

  const continueToBeta = () => {
    recordBetaWelcomeStep('continued');
    onContinue();
  };

  return createPortal(
    <div className="beta-welcome-backdrop" role="presentation">
      <div
        className="beta-welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beta-welcome-title"
        aria-describedby="beta-welcome-subtitle"
      >
        <button
          type="button"
          className="beta-welcome-close"
          aria-label={t('betaWelcome.dismiss')}
          onClick={() => {
            recordBetaWelcomeStep('dismissed');
            onContinue();
          }}
        >
          <PixelIcon name="close" size={13} />
        </button>

        <div className="beta-welcome-mascot" aria-hidden="true">
          <Mascot emotion="proud" size={82} />
        </div>
        <div className="beta-welcome-kicker">{t('betaWelcome.kicker')}</div>
        <h1 id="beta-welcome-title">{t('betaWelcome.title')}</h1>
        <p id="beta-welcome-subtitle" className="beta-welcome-subtitle">
          {t('betaWelcome.subtitle')}
        </p>

        <div className="beta-welcome-path">
          <article>
            <PixelIcon name="play" size={18} />
            <h2>{t('betaWelcome.playTitle')}</h2>
            <p>{t('betaWelcome.playBody')}</p>
          </article>
          <article>
            <PixelIcon name="sparkle" size={18} />
            <h2>{t('betaWelcome.buildTitle')}</h2>
            <p>{t('betaWelcome.buildBody')}</p>
          </article>
          <article>
            <PixelIcon name="send" size={18} />
            <h2>{t('betaWelcome.feedbackTitle')}</h2>
            <p>{t('betaWelcome.feedbackBody')}</p>
          </article>
        </div>

        <p className="beta-welcome-note">{t('betaWelcome.note')}</p>
        <button type="button" className="beta-welcome-cta" onClick={continueToBeta}>
          <PixelIcon name="arrowRight" size={14} />
          {t('betaWelcome.cta')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
