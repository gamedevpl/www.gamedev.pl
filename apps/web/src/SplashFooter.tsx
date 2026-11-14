import { useTranslation } from 'react-i18next';
import { splashXUrl, splashYouTubeUrl } from './gameVideos.js';

// Invite note, follow links (YouTube first), then terms and privacy.
export function SplashFooter() {
  const { t } = useTranslation();
  return (
    <>
      <p className="beta-splash__footer">{t('betaSplash.footer')}</p>
      <p className="beta-splash__social">
        {t('betaSplash.follow')}{' '}
        <a href={splashYouTubeUrl} target="_blank" rel="noreferrer noopener">
          YouTube
        </a>
        {' · '}
        <a href={splashXUrl} target="_blank" rel="noreferrer noopener">
          X
        </a>
      </p>
      <nav className="beta-splash__legal" aria-label={t('footer.legalNav')}>
        <a href="/terms">{t('legal.terms')}</a>
        <a href="/privacy">{t('legal.privacy')}</a>
      </nav>
    </>
  );
}
