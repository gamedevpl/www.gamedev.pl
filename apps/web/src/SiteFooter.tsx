import { useTranslation } from 'react-i18next';
import githubIcon from './assets/github-mark-white.svg';
import { bugReportUrl, REPO_URL } from './github.js';
import { OPERATOR_LEGAL_NAME } from './legal/operator.js';
import { contactPath, legalPath } from './core/router.js';
import { currentVisitId } from './visitTelemetry.js';

/**
 * The site footer, and the one legally load-bearing piece of chrome on the page.
 *
 * It carries the provider identity UŚUDE art. 5 requires to be published, the links
 * to both legal documents, and the AI-generation disclosure from AI Act art. 50. It
 * renders on every route including the closed-beta splash, because an anonymous
 * visitor is exactly the person these disclosures are written for.
 *
 * Contact opens the in-app form that emails the published address. The address itself
 * also lives in the legal documents (and as a mailto fallback on the form), not as a
 * second prominent line under the brand. Address and tax id stay in legal/operator.ts
 * until the operator publishes them; rendering empty constants was a CodeQL
 * false-positive (js/trivial-conditional) and is omitted until those values are
 * non-empty.
 */
export function SiteFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__identity">
          {/* The prominent name here IS the published operator identity, not decoration —
              so it renders OPERATOR_LEGAL_NAME rather than a hardcoded wordmark. Today
              the two happen to read the same; the day a registered entity is published
              this line becomes that entity instead of quietly disagreeing with it. */}
          <p className="site-footer__brand">{OPERATOR_LEGAL_NAME}</p>
        </div>

        <nav className="site-footer__links" aria-label={t('footer.legalNav')}>
          <a href={legalPath('terms')}>{t('legal.terms')}</a>
          <a href={legalPath('privacy')}>{t('legal.privacy')}</a>
          <a href={legalPath('terms', 'zglaszanie')}>{t('footer.reportIllegal')}</a>
          <a href={contactPath()}>{t('footer.contact')}</a>
        </nav>
      </div>

      {/* The project half of the footer. Read at render time rather than in an effect so
          the link always carries the id of the visit the reporter is actually in. */}
      <nav className="site-footer__links site-footer__project" aria-label={t('footer.projectNav')}>
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="site-footer__github">
          <img src={githubIcon} alt="" width="14" height="14" />
          {t('footer.openSource')}
        </a>
        <a
          href={bugReportUrl({ where: window.location.pathname, visitId: currentVisitId() })}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('footer.reportBug')}
        </a>
      </nav>

      <p className="site-footer__ai">{t('footer.aiDisclosure')}</p>
      <p className="site-footer__copy">© {year} gamedev.pl</p>
    </footer>
  );
}
