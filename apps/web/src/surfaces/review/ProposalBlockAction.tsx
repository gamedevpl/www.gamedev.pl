import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blockContributor } from '../../proposalsApi.js';

// Blocking reaches every game the owner has, so it asks first.
export function ProposalBlockAction(props: { proposerUid: string; handle: string }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'failed'>('idle');

  async function block() {
    setStep('busy');
    try {
      await blockContributor(props.proposerUid);
      setStep('done');
    } catch {
      setStep('failed');
    }
  }

  if (step === 'done') {
    return (
      <p className="propose-note" role="status">
        {t('reviews.blockDone')}
      </p>
    );
  }
  if (step === 'confirm' || step === 'busy') {
    return (
      <div className="propose-composer">
        <p className="propose-note">{t('reviews.blockConfirm', { handle: props.handle })}</p>
        <div className="propose-actions">
          <button
            type="button"
            className="remix-btn is-primary"
            disabled={step === 'busy'}
            onClick={() => void block()}
          >
            {t('reviews.blockConfirmAction')}
          </button>
          <button
            type="button"
            className="remix-btn is-quiet"
            disabled={step === 'busy'}
            onClick={() => setStep('idle')}
          >
            {t('propose.cancel')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {step === 'failed' ? (
        <p className="propose-error" role="alert">
          {t('reviews.blockFailed')}
        </p>
      ) : null}
      <button type="button" className="remix-btn is-quiet" onClick={() => setStep('confirm')}>
        {t('reviews.block')}
      </button>
    </>
  );
}
