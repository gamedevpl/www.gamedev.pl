import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';

// Fills the footer gap on short pages, nudging back to the composer.
export function BottomCta() {
  const { t } = useTranslation();

  function scrollToComposer() {
    document.getElementById('hero-prompt')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
