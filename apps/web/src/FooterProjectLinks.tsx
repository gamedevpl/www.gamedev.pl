import { useTranslation } from 'react-i18next';
import githubIcon from './assets/github-mark-white.svg';
import { REPO_URL } from './github.js';

export const YOUTUBE_URL = 'https://www.youtube.com/@gamedev_pl';
export const X_URL = 'https://x.com/plgamedev';

// Where the project lives and where it posts; brand names stay untranslated.
export function FooterProjectLinks() {
  const { t } = useTranslation();
  return (
    <>
      <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="site-footer__github">
        <img src={githubIcon} alt="" width="14" height="14" />
        {t('footer.openSource')}
      </a>
      <a href={YOUTUBE_URL} target="_blank" rel="noreferrer noopener">
        YouTube
      </a>
      <a href={X_URL} target="_blank" rel="noreferrer noopener">
        X
      </a>
    </>
  );
}
