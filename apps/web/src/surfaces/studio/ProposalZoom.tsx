import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// One frame of the comparison, enlarged inside the dialog.
export type ZoomTarget = {
  src: string;
  label: string;
  concept: boolean;
};

// Beside the frame, never on it: games draw HUD there.
export function ConceptBadge() {
  const { t } = useTranslation();
  return <span className="studio-proposal-ai">{t('statusView.proposal.aiLabel')}</span>;
}

export const ProposalZoom = forwardRef<
  HTMLDivElement,
  { target: ZoomTarget; currentSrc: string; currentLabel: string; onClose: () => void }
>(function ProposalZoom({ target, currentSrc, currentLabel, onClose }, ref) {
  const { t } = useTranslation();
  const [toggled, setToggled] = useState(false);
  const [held, setHeld] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const showReal = target.concept && (toggled || held);

  useLayoutEffect(() => {
    closeRef.current?.focus();
  }, []);

  const release = () => setHeld(false);

  return (
    <div
      ref={ref}
      className="studio-proposal-zoom-view"
      role="group"
      aria-label={target.label}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="studio-proposal-zoom-body" onClick={(event) => event.stopPropagation()}>
        <div className="studio-proposal-zoom-head">
          <span className="studio-proposal-zoom-title">
            {showReal ? null : target.concept ? <ConceptBadge /> : null}
            <strong>{showReal ? currentLabel : target.label}</strong>
          </span>
          <button
            ref={closeRef}
            type="button"
            className="studio-proposal-close"
            onClick={onClose}
            aria-label={t('statusView.proposal.close')}
          >
            ×
          </button>
        </div>
        <img
          className="studio-proposal-zoom-img"
          src={showReal ? currentSrc : target.src}
          alt={showReal ? currentLabel : target.label}
          draggable={false}
          onPointerDown={target.concept ? () => setHeld(true) : undefined}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          onContextMenu={(event) => event.preventDefault()}
        />
        {target.concept ? (
          <div className="studio-proposal-zoom-foot">
            <button
              type="button"
              className="studio-proposal-secondary studio-proposal-compare"
              aria-pressed={toggled}
              onClick={() => setToggled((value) => !value)}
            >
              {t('statusView.proposal.compare')}
            </button>
            <span className="studio-proposal-zoom-hint">{t('statusView.proposal.holdHint')}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
});
