import type { BuilderUnavailableReason } from '@gamedevpl/contract';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuilderKind } from './builderKind.js';
import { PixelIcon } from './PixelIcon.js';
import { recordStudioStep } from './visitTelemetry.js';

export type { BuilderUnavailableReason } from '@gamedevpl/contract';

type BuilderChoiceProps = {
  value: BuilderKind;
  onChange: (next: BuilderKind) => void;
  disabled?: boolean;
  /** Quieter presentation for the thread composer; full for the confirm screen. */
  compact?: boolean;
  /**
   * Drops the legend visually where the surrounding screen already asks the question —
   * the confirm wizard gives it a whole stage heading. It stays in the accessibility
   * tree, because a fieldset without a legend is a group a screen reader can't name.
   */
  hideLegend?: boolean;
  // Why platform is unavailable. Never disabled; see the aria attribute below.
  platformUnavailable?: BuilderUnavailableReason;
};

/**
 * Who builds this round — platform team or the creator's own coding agent.
 *
 * Full two-up choice for the create wizard and the Change modal. Round-boundary
 * Studio chrome uses {@link BuilderModeBadge} instead — sticky continuity with
 * progressive disclosure, not a permanent peer fork above the composer.
 */
export function BuilderChoice({
  value,
  onChange,
  disabled = false,
  compact = false,
  hideLegend = false,
  platformUnavailable,
}: BuilderChoiceProps) {
  const { t } = useTranslation();
  const noteId = useId();

  const select = (next: BuilderKind) => {
    if (next === 'platform' && platformUnavailable) return;
    onChange(next);
    recordStudioStep('builder_chosen', next);
  };

  return (
    <fieldset className={`builder-choice${compact ? ' is-compact' : ''}`} disabled={disabled}>
      <legend className={`builder-choice-legend${hideLegend ? ' is-visually-hidden' : ''}`}>
        {t('builder.legend')}
      </legend>
      <div className="builder-choice-options" role="radiogroup" aria-label={t('builder.legend')}>
        {(['platform', 'self'] as const).map((kind) => {
          const unavailable = kind === 'platform' ? platformUnavailable : undefined;
          const selected = value === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={unavailable ? true : undefined}
              aria-describedby={unavailable ? noteId : undefined}
              className={`builder-choice-option${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`}
              disabled={disabled}
              title={unavailable ? t(`builder.platform.unavailable.detail.${unavailable}`) : undefined}
              onClick={() => select(kind)}
            >
              {hideLegend && (
                <span className="qa-builder-symbols">
                  <PixelIcon name={kind === 'platform' ? 'gamepad' : 'code'} size={28} />
                  {selected && <PixelIcon name="check" size={16} />}
                </span>
              )}
              <span className="builder-choice-option-title">
                {t(`builder.${kind}.title`)}
                {unavailable && (
                  <span className="builder-choice-option-badge">
                    {t(`builder.platform.unavailable.badge.${unavailable}`)}
                  </span>
                )}
              </span>
              <span className="builder-choice-option-detail" id={unavailable ? noteId : undefined}>
                {unavailable ? t(`builder.platform.unavailable.note.${unavailable}`) : t(`builder.${kind}.detail`)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
