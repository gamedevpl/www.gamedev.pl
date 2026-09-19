import { useTranslation } from 'react-i18next';

interface CreatorQADiscardModalProps {
  onKeep: () => void;
  onDiscard: () => void;
}

export function CreatorQADiscardModal({ onKeep, onDiscard }: CreatorQADiscardModalProps) {
  const { t } = useTranslation();

  return (
    <div className="qa-confirm-backdrop" role="presentation" onClick={onKeep}>
      <div
        className="qa-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="qa-discard-title"
        aria-describedby="qa-discard-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="qa-discard-title" className="qa-confirm-title">
          {t('qa.discardTitle')}
        </h3>
        <p id="qa-discard-desc" className="qa-confirm-desc">
          {t('qa.discardDescription')}
        </p>
        <div className="qa-confirm-actions">
          <button type="button" className="qa-confirm-btn qa-confirm-keep" onClick={onKeep} autoFocus>
            {t('qa.keepCreating')}
          </button>
          <button type="button" className="qa-confirm-btn qa-confirm-discard" onClick={onDiscard}>
            {t('qa.discardAndExit')}
          </button>
        </div>
      </div>
    </div>
  );
}
