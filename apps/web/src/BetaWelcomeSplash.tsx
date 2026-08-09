import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Mascot } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';
import { recordBetaWelcomeStep } from './visitTelemetry.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BetaWelcomeSplash({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  useEffect(() => {
    recordBetaWelcomeStep('shown');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        recordBetaWelcomeStep('dismissed');
        onContinueRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = cardRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('keydown', onKeyDown);
    cardRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  const continueToBeta = () => {
    recordBetaWelcomeStep('continued');
    onContinue();
  };

  return createPortal(
    <div className="beta-welcome-backdrop" role="presentation">
      <div
        className="beta-welcome-card"
        ref={cardRef}
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
          <Mascot className="beta-welcome-mascot__mark" emotion="proud" size={82} staticPose />
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
            <a
              href="/contact"
              onClick={() => {
                recordBetaWelcomeStep('continued');
                onContinue();
              }}
            >
              {t('betaWelcome.feedbackCta')}
            </a>
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
