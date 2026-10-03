import { useTranslation } from 'react-i18next';
import { CONTACT_EMAIL, SERVICE_URL } from './legal/operator.js';
import { PixelIcon } from './PixelIcon.js';

// DSA art. 16 notice, prefilled so a report can be acted on.
export function ReportGameButton({
  slug,
  title,
  labelKey = 'report.action',
  plain = false,
}: {
  slug: string;
  title: string;
  labelKey?: 'report.action' | 'footer.reportIllegal';
  plain?: boolean;
}) {
  const { t } = useTranslation();
  const label = t(labelKey);

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
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (plain)
    return (
      <a className="report-email" href={href}>
        {label}
      </a>
    );

  // Styled as a real secondary control (not a muted ghost link): players kept reading
  // the old quiet colour as "disabled", which made the DSA path look broken.
  return (
    <a className="secondary-btn report-btn" href={href} aria-label={label} title={label}>
      <PixelIcon name="flag" size={13} />
      <span className="btn-label">{label}</span>
    </a>
  );
}
