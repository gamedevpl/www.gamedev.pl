import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MODERATION_FLAG_REASONS, type ModerationFlagReason } from '@gamedevpl/contract';
import { raiseModerationFlag } from './reviewApi.js';
import type { AssessmentSource } from './reviewTypes.js';
import './review-flag.css';

// Reporting, not judging: no consensus, no checklist, no verdict.
export function ReviewFlagDialog({
  slug,
  title,
  source,
  onClose,
  onRaised,
}: {
  slug: string;
  title: string;
  source: AssessmentSource;
  onClose: () => void;
  onRaised: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ModerationFlagReason>('sexual');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await raiseModerationFlag({ slug, source, reason, note: note.trim() });
      onRaised();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('review.flag.error'));
      setBusy(false);
    }
  }

  return (
    <div className="review-flag-backdrop" role="presentation" onClick={onClose}>
      <div
        className="review-flag"
        role="dialog"
        aria-modal="true"
        aria-label={t('review.flag.title')}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="review-flag-title">{t('review.flag.title')}</h3>
        <p className="review-flag-lead">{t('review.flag.lead', { title })}</p>

        <label className="review-flag-label" htmlFor="review-flag-reason">
          {t('review.flag.reasonLabel')}
        </label>
        <select
          id="review-flag-reason"
          className="review-flag-select"
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value as ModerationFlagReason)}
        >
          {MODERATION_FLAG_REASONS.map((value) => (
            <option key={value} value={value}>
              {t(`review.flag.reason.${value}`)}
            </option>
          ))}
        </select>

        <label className="review-flag-label" htmlFor="review-flag-note">
          {t('review.flag.noteLabel')}
        </label>
        <textarea
          id="review-flag-note"
          className="review-flag-note"
          value={note}
          disabled={busy}
          placeholder={t('review.flag.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
        />

        {error ? (
          <p className="review-flag-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="review-flag-actions">
          <button type="button" className="review-flag-cancel" onClick={onClose} disabled={busy}>
            {t('review.flag.cancel')}
          </button>
          <button
            type="button"
            className="review-flag-send"
            onClick={() => void submit()}
            disabled={busy || !note.trim()}
          >
            {t('review.flag.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
