import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
export function FeedbackReceipt({ textKey, onDismiss }: { textKey: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="status-feedback-receipt" role="status">
      <span className="status-feedback-sent">
        <PixelIcon name="check" size={13} />
        <span className="status-feedback-sent-text">{t(textKey)}</span>
      </span>
      <button
        type="button"
        className="status-feedback-receipt-dismiss"
        onClick={onDismiss}
        aria-label={t('statusView.feedback.dismissSent')}
      >
        <PixelIcon name="close" size={11} />
      </button>
    </div>
  );
}
