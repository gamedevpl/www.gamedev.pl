import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { abandonSubmission } from '../../submissionApi.js';

// Stops the build for good, after an explicit confirm step.
export function AbandonControl({ token }: { token: string }) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<'idle' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);

  const abandon = async () => {
    setState('sending');
    setError(null);
    try {
      await abandonSubmission(token);
      // The next poll tick picks up the terminal state.
    } catch {
      setError(t('statusView.abandon.error'));
      setState('idle');
      setArmed(false);
    }
  };

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        className="status-abandon"
        onClick={() => setArmed(true)}
        title={t('statusView.abandon.start')}
        aria-label={t('statusView.abandon.start')}
      >
        {t('statusView.abandon.start')}
      </button>
    );
  }

  return (
    <span className="status-abandon-confirm">
      {t('statusView.abandon.confirm')}
      <button
        type="button"
        className="status-abandon is-danger"
        disabled={state === 'sending'}
        onClick={() => void abandon()}
      >
        {state === 'sending' ? t('statusView.abandon.sending') : t('statusView.abandon.yes')}
      </button>
      <button type="button" className="status-abandon" onClick={() => setArmed(false)}>
        {t('statusView.abandon.no')}
      </button>
    </span>
  );
}
