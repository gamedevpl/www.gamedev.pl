import { useTranslation } from 'react-i18next';
import { CONTACT_EMAIL, SERVICE_URL } from './legal/operator.js';
import { PixelIcon } from './PixelIcon.js';

/**
 * Notice-and-action, minimum viable (DSA art. 16).
 *
 * Every hosting provider must let anyone — account or not — flag content they believe
 * is illegal, and a notice only obliges us to act if it is precise enough to act on:
 * why it is illegal, where it is, who is reporting, and a good-faith statement. So the
 * mail is pre-filled with those four headings rather than opening an empty message and
 * hoping. Article 16 applies regardless of company size; the micro-enterprise
 * exemption in art. 19 covers the platform tier above this, not this.
 *
 * A mailto is the honest MVP: it genuinely reaches a human, and it needs no mailbox we
 * do not already have to run. Its weakness is that receipt confirmation and the
 * statement of reasons are manual — the in-product form that fixes this is Phase 2 of
 * legal-compliance-plan.md in the private www.gamedev.pl-ops repo.
 */
export function ReportGameButton({ slug, title }: { slug: string; title: string }) {
  const { t } = useTranslation();

  const gameUrl = `${SERVICE_URL}/play/${slug}`;
  const subject = t('report.mailSubject', { title, slug });
  const body = [
    t('report.mailIntro'),
    '',
    `${t('report.fieldLocation')}: ${gameUrl}`,
    `${t('report.fieldGame')}: ${title} (${slug})`,
    '',
    `${t('report.fieldWhy')}:`,
    '',
    '',
    `${t('report.fieldWho')}:`,
    '',
    '',
    t('report.goodFaith'),
  ].join('\n');

  // Styled as a real secondary control (not a muted ghost link): players kept reading
  // the old quiet colour as "disabled", which made the DSA path look broken.
  return (
    <a
      className="secondary-btn report-btn"
      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
      aria-label={t('report.action')}
      title={t('report.action')}
    >
      <PixelIcon name="flag" size={13} />
      <span className="btn-label">{t('report.action')}</span>
    </a>
  );
}
