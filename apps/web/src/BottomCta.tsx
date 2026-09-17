import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';

// Fills the footer gap on short pages, nudging back to the composer.
export function BottomCta() {
  const { t } = useTranslation();

  function scrollToComposer() {
    const composer = document.getElementById('hero-prompt');
    composer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const input = composer?.querySelector<HTMLTextAreaElement | HTMLInputElement>('.big-prompt-input');
    input?.focus({ preventScroll: true });
  }

  return (
    <section className="bottom-cta">
      <div className="bottom-cta-copy">
        <h3 className="bottom-cta-headline">{t('bottomCta.headline')}</h3>
        <p className="bottom-cta-sub">{t('bottomCta.sub')}</p>
      </div>
      <button type="button" className="primary-btn bottom-cta-action" onClick={scrollToComposer}>
        <PixelIcon name="sparkle" size={13} /> {t('bottomCta.action')}
      </button>
    </section>
  );
}
