import { useTranslation } from 'react-i18next';
import { bugReportUrl, ISSUES_URL, REPO_URL } from './github';
import { OPERATOR_ADDRESS, OPERATOR_LEGAL_NAME, OPERATOR_TAX_ID } from './legal/operator';
import { legalPath } from './router';
import { currentVisitId } from './visitTelemetry';

/**
 * The site footer, and the one legally load-bearing piece of chrome on the page.
 *
 * It carries the provider identity UŚUDE art. 5 requires to be published, the links
 * to both legal documents, and the AI-generation disclosure from AI Act art. 50. It
 * renders on every route including the closed-beta splash, because an anonymous
 * visitor is exactly the person these disclosures are written for.
 *
 * The electronic contact address lives in the legal documents (linked below), not as
 * a second prominent line under the brand — Contact in the nav opens the GitHub
 * issue tracker instead. `OPERATOR_ADDRESS` and `OPERATOR_TAX_ID` render only when
 * set — see the note in legal/operator.ts about publishing a home address.
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
          {OPERATOR_ADDRESS && <p className="site-footer__operator">{OPERATOR_ADDRESS}</p>}
          {OPERATOR_TAX_ID && <p className="site-footer__operator">NIP: {OPERATOR_TAX_ID}</p>}
        </div>

        <nav className="site-footer__links" aria-label={t('footer.legalNav')}>
          <a href={legalPath('terms')}>{t('legal.terms')}</a>
          <a href={legalPath('privacy')}>{t('legal.privacy')}</a>
          <a href={legalPath('terms', 'zglaszanie')}>{t('footer.reportIllegal')}</a>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener">
            {t('footer.contact')}
          </a>
        </nav>
      </div>

      {/* The project half of the footer. Read at render time rather than in an effect so
          the link always carries the id of the visit the reporter is actually in. */}
      <nav className="site-footer__links site-footer__project" aria-label={t('footer.projectNav')}>
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
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
