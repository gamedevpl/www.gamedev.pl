import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BuilderChoice, type BuilderUnavailableReason } from './BuilderChoice.js';
import type { BuilderKind } from './builderKind.js';
import { PixelIcon } from './PixelIcon.js';

type BuilderModeBadgeProps = {
  value: BuilderKind;
  onChange: (next: BuilderKind) => void;
  /**
   * Round is silent — the next send can open a new round, so the selector opens
   * the choice modal. While an agent is mid-work it stays a read-only label.
   */
  canChange: boolean;
  disabled?: boolean;
  /** Why `platform` cannot be picked right now, when it can't. See BuilderChoice. */
  platformUnavailable?: BuilderUnavailableReason;
};

/**
 * Builder control for the Studio composer toolbar (Claude / Cursor / Copilot shape).
 *
 * Lives in the bottom toolbar of the prompt card — left side, like a model picker —
 * not as a floating badge over the textarea. Changeable only while generation is
 * silent; opens the same two-up choice the create wizard uses.
 */
export function BuilderModeBadge({
  value,
  onChange,
  canChange,
  disabled = false,
  platformUnavailable,
}: BuilderModeBadgeProps) {
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
  const className = `builder-mode-selector${value === 'self' ? ' is-self' : ' is-platform'}${
    canChange ? '' : ' is-static'
  }`;

  return (
    <>
      {canChange ? (
        <button
          type="button"
          className={className}
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="builder-mode-selector-label">{label}</span>
          <PixelIcon name="chevronDown" size={11} />
        </button>
      ) : (
        <span className={className} title={label}>
          <span className="builder-mode-selector-label">{label}</span>
        </span>
      )}
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
                <BuilderChoice
                  value={value}
                  onChange={onChange}
                  disabled={disabled}
                  hideLegend
                  platformUnavailable={platformUnavailable}
                />
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
