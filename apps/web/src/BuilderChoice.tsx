import type { BuilderUnavailableReason } from '@gamedevpl/contract';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuilderKind } from './builderKind.js';
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
        <button
          type="button"
          role="radio"
          aria-checked={value === 'platform'}
          aria-disabled={platformUnavailable ? true : undefined}
          aria-describedby={platformUnavailable ? noteId : undefined}
          className={`builder-choice-option${value === 'platform' ? ' is-selected' : ''}${
            platformUnavailable ? ' is-unavailable' : ''
          }`}
          disabled={disabled}
          title={platformUnavailable ? t(`builder.platform.unavailable.detail.${platformUnavailable}`) : undefined}
          onClick={() => select('platform')}
        >
          <span className="builder-choice-option-title">
            {t('builder.platform.title')}
            {platformUnavailable && (
              <span className="builder-choice-option-badge">
                {t(`builder.platform.unavailable.badge.${platformUnavailable}`)}
              </span>
            )}
          </span>
          <span className="builder-choice-option-detail">
            {platformUnavailable ? (
              <span id={noteId}>{t(`builder.platform.unavailable.note.${platformUnavailable}`)}</span>
            ) : (
              t('builder.platform.detail')
            )}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'self'}
          className={`builder-choice-option${value === 'self' ? ' is-selected' : ''}`}
          disabled={disabled}
          onClick={() => select('self')}
        >
          <span className="builder-choice-option-title">{t('builder.self.title')}</span>
          <span className="builder-choice-option-detail">{t('builder.self.detail')}</span>
        </button>
      </div>
    </fieldset>
  );
}
