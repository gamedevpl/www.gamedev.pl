import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BuilderChoice } from './BuilderChoice.js';
import type { BuilderKind } from './builderKind.js';

type BuilderModeBadgeProps = {
  value: BuilderKind;
  onChange: (next: BuilderKind) => void;
  /**
   * Round is silent — the next send can open a new round, so Change is offered.
   * While an agent is mid-work the badge stays informational only.
   */
  canChange: boolean;
  disabled?: boolean;
};

/**
 * Sticky builder signal for the Studio composer.
 *
 * The create wizard keeps the full two-up choice. At round boundaries the
 * composer only shows this badge; Change opens the same decision in a modal so
 * "who builds" is progressive disclosure, not permanent chrome.
 */
export function BuilderModeBadge({ value, onChange, canChange, disabled = false }: BuilderModeBadgeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const label = t(value === 'self' ? 'builder.badge.self' : 'builder.badge.platform');

  return (
    <>
      <div className={`builder-mode-badge${value === 'self' ? ' is-self' : ' is-platform'}`}>
        <span className="builder-mode-badge-label">{label}</span>
        {canChange ? (
          <button type="button" className="builder-mode-badge-change" disabled={disabled} onClick={() => setOpen(true)}>
            {t('builder.badge.change')}
          </button>
        ) : null}
      </div>
      {open
        ? createPortal(
            <div className="modal-backdrop builder-choice-modal-backdrop" onClick={() => setOpen(false)}>
              <div
                className="builder-choice-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setOpen(false)}
                  aria-label={t('builder.badge.modalClose')}
                >
                  &times;
                </button>
                <h2 id={titleId} className="builder-choice-modal-title">
                  {t('builder.legend')}
                </h2>
                <p className="builder-choice-modal-lede">{t('builder.badge.modalLede')}</p>
                <BuilderChoice value={value} onChange={onChange} disabled={disabled} hideLegend />
                <button type="button" className="primary-btn builder-choice-modal-done" onClick={() => setOpen(false)}>
                  {t('builder.badge.modalDone')}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
