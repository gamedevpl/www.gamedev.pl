import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface CreatorQADiscardModalProps {
  onKeep: () => void;
  onDiscard: () => void;
  openerElement?: HTMLElement | null;
}

export function CreatorQADiscardModal({ onKeep, onDiscard, openerElement }: CreatorQADiscardModalProps) {
  const { t } = useTranslation();
  const isDiscardingRef = useRef(false);

  const handleKeep = useCallback(() => {
    onKeep();
    openerElement?.focus?.();
  }, [onKeep, openerElement]);

  const handleDiscard = () => {
    isDiscardingRef.current = true;
    onDiscard();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleKeep();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (!isDiscardingRef.current) {
        openerElement?.focus?.();
      }
    };
  }, [openerElement, handleKeep]);

  return (
    <div className="qa-confirm-backdrop" role="presentation" onClick={handleKeep}>
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
          <button type="button" className="qa-confirm-btn qa-confirm-keep" onClick={handleKeep} autoFocus>
            {t('qa.keepCreating')}
          </button>
          <button type="button" className="qa-confirm-btn qa-confirm-discard" onClick={handleDiscard}>
            {t('qa.discardAndExit')}
          </button>
        </div>
      </div>
    </div>
  );
}
