import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mascot } from './Mascot.js';
import { SUBMITTING_STEPS } from './submissionSteps.js';

export function CreatorQASubmittingCard({ submitting }: { submitting: boolean }) {
  const { t } = useTranslation();
  const [submittingStepIndex, setSubmittingStepIndex] = useState(0);

  useEffect(() => {
    if (!submitting) {
      setSubmittingStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setSubmittingStepIndex((prev) => {
        const next = prev + 1;
        if (next >= SUBMITTING_STEPS.length - 1) {
          clearInterval(interval);
          return SUBMITTING_STEPS.length - 1;
        }
        return next;
      });
    }, 2800);
    return () => clearInterval(interval);
  }, [submitting]);

  if (!submitting) return null;

  const progressPercent = Math.min(95, Math.round(((submittingStepIndex + 1) / SUBMITTING_STEPS.length) * 100));

  return (
    <div className="qa-submitting-card" role="status" aria-live="polite">
      <div className="qa-submitting-card__top">
        <Mascot emotion="busy" size={56} cooking title={t('mascot.busyAlt')} />
        <div className="qa-submitting-card__content">
          <p className="qa-submitting-card__title">{t('qa.submittingTitle')}</p>
          <p className="qa-submitting-card__step">
            <span className="build-btn-spinner" aria-hidden="true" />
            <span className="qa-submitting-card__step-text">{t(SUBMITTING_STEPS[submittingStepIndex])}</span>
          </p>
          <p className="qa-submitting-card__hint">{t('qa.submittingHint')}</p>
        </div>
      </div>
      <div className="qa-submitting-card__progress-bar" aria-hidden="true">
        <div className="qa-submitting-card__progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
