import { useTranslation } from 'react-i18next';
import { MascotMoment } from './Mascot';
import { PixelIcon } from './PixelIcon';

type NotFoundPageProps = {
  onHome: () => void;
};

/**
 * SPA catch-all for unknown / invalid paths. The API still serves `index.html` for
 * these URLs (so refresh works); this is the client view that replaces the old
 * silent fall-through to home.
 */
export function NotFoundPage({ onHome }: NotFoundPageProps) {
  const { t } = useTranslation();

  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <MascotMoment emotion="confused" size={88} title={t('mascot.confusedAlt')}>
        <p className="not-found__code" aria-hidden="true">
          404
        </p>
        <h1 id="not-found-title" className="not-found__title">
          {t('notFound.title')}
        </h1>
        <p className="not-found__copy">{t('notFound.copy')}</p>
        <button type="button" className="primary-btn not-found__home" onClick={onHome}>
          <PixelIcon name="arrowRight" size={12} /> {t('notFound.home')}
        </button>
      </MascotMoment>
    </section>
  );
}
