import { useTranslation } from 'react-i18next';
import type { BuilderKind } from './builderKind.js';

type BuilderChoiceProps = {
  value: BuilderKind;
  onChange: (next: BuilderKind) => void;
  disabled?: boolean;
  /** Quieter presentation for the thread composer; full for the confirm screen. */
  compact?: boolean;
};

/**
 * Who builds this round — platform team or the creator's own coding agent.
 *
 * Shown on the creation confirm screen and again whenever a new round is about to
 * start. Selection is a pair of pressed options, not a settings dig.
 */
export function BuilderChoice({ value, onChange, disabled = false, compact = false }: BuilderChoiceProps) {
  const { t } = useTranslation();

  return (
    <fieldset className={`builder-choice${compact ? ' is-compact' : ''}`} disabled={disabled}>
      <legend className="builder-choice-legend">{t('builder.legend')}</legend>
      <div className="builder-choice-options" role="radiogroup" aria-label={t('builder.legend')}>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'platform'}
          className={`builder-choice-option${value === 'platform' ? ' is-selected' : ''}`}
          disabled={disabled}
          onClick={() => onChange('platform')}
        >
          <span className="builder-choice-option-title">{t('builder.platform.title')}</span>
          <span className="builder-choice-option-detail">{t('builder.platform.detail')}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'self'}
          className={`builder-choice-option${value === 'self' ? ' is-selected' : ''}`}
          disabled={disabled}
          onClick={() => onChange('self')}
        >
          <span className="builder-choice-option-title">{t('builder.self.title')}</span>
          <span className="builder-choice-option-detail">{t('builder.self.detail')}</span>
        </button>
      </div>
    </fieldset>
  );
}
