import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon';

export interface QAOption {
  label: string;
  detail?: string;
}

export interface QAQuestion {
  id: string;
  question: string;
  options: QAOption[];
  allowFreeText?: boolean;
}

interface CreatorQAProps {
  questions: QAQuestion[];
  initialConcept: string;
  onSubmitWithConcept: (finalConcept: string) => void;
  onCancel?: () => void;
  /** The submission is in flight; the panel stays up rather than vanishing into a gap. */
  submitting?: boolean;
  /** Shown here as well as in the hero, because this is where the creator is looking. */
  error?: string | null;
}

export function CreatorQA({
  questions,
  initialConcept,
  onSubmitWithConcept,
  onCancel,
  submitting = false,
  error = null,
}: CreatorQAProps) {
  const { t } = useTranslation();
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [customText, setCustomText] = useState<Record<string, string>>({});

  const handleSelectOption = (questionId: string, label: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: prev[questionId] === label ? '' : label,
    }));
  };

  const handleCustomTextChange = (questionId: string, text: string) => {
    setCustomText((prev) => ({
      ...prev,
      [questionId]: text,
    }));
  };

  /**
   * A chip and free text are one answer, not two competing ones.
   *
   * Free text used to *replace* the chip, so clicking "Pixel Art" and then typing
   * "but with an Amiga palette" threw the chip away and sent only the qualifier —
   * silently, since the creator had already seen their choice highlighted. Typing a
   * refinement is the commonest way to answer these questions, so the two combine.
   */
  const answerFor = (questionId: string): string => {
    const selected = selectedAnswers[questionId];
    const custom = customText[questionId]?.trim();
    if (selected && custom) return `${selected} — ${custom}`;
    return custom || selected || '';
  };

  const buildMergedConcept = (): string => {
    const clarifications: string[] = [];

    for (const q of questions) {
      const answer = answerFor(q.id);
      if (answer) {
        clarifications.push(`- ${q.question.replace(/\?$/, '')}: ${answer}`);
      }
    }

    if (clarifications.length === 0) {
      return initialConcept;
    }

    return `${initialConcept.trim()}\n\n## Creator clarifications\n${clarifications.join('\n')}`;
  };

  const handleSubmit = () => {
    onSubmitWithConcept(buildMergedConcept());
  };

  return (
    <div className="qa-container panel">
      <div className="qa-header">
        <h3 className="qa-title">{t('qa.title')}</h3>
        <p className="qa-subtitle">{t('qa.subtitle')}</p>
      </div>

      <div className="qa-actions qa-actions--top">
        <button type="button" className="btn btn-primary btn-create-now" onClick={handleSubmit} disabled={submitting}>
          <PixelIcon name="rocket" size={14} /> {submitting ? t('submit.submitting') : t('qa.createNow')}
        </button>
        {/* This dismisses the panel and drops the pending spec — it does *not* submit.
            It was labelled "skip clarifications", which reads as "create without
            answering"; that is what the primary button next to it already does. */}
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            {t('qa.backToEditing')}
          </button>
        )}
      </div>

      <div className="qa-questions-list">
        {questions.map((q) => {
          const selected = selectedAnswers[q.id];
          const custom = customText[q.id] ?? '';

          return (
            <div key={q.id} className="qa-card">
              <h4 className="qa-card__question">{q.question}</h4>
              <div className="qa-chips">
                {q.options.map((opt) => {
                  // Stays lit while free text is typed: the two are now one answer,
                  // and un-highlighting the chip was how the old behaviour hid itself.
                  const isSelected = selected === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      // Selection lived only in a class, so a screen reader announced
                      // every chip identically whether or not it was chosen.
                      aria-pressed={isSelected}
                      className={`qa-chip ${isSelected ? 'qa-chip--selected' : ''}`}
                      onClick={() => handleSelectOption(q.id, opt.label)}
                    >
                      <span className="qa-chip__label">{opt.label}</span>
                      {opt.detail && <span className="qa-chip__detail">{opt.detail}</span>}
                    </button>
                  );
                })}
              </div>

              {q.allowFreeText !== false && (
                <div className="qa-custom-input">
                  <input
                    type="text"
                    className="input-text"
                    placeholder={t('qa.otherPlaceholder')}
                    // The placeholder is the only visible cue, and placeholders are
                    // not names — without this the field is announced unlabelled.
                    aria-label={`${q.question} — ${t('qa.otherPlaceholder')}`}
                    value={custom}
                    onChange={(e) => handleCustomTextChange(q.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.values(selectedAnswers).some(Boolean) || Object.values(customText).some((s) => s.trim().length > 0) ? (
        <div className="qa-preview">
          <h5>{t('qa.clarificationsTitle')}</h5>
          <pre className="qa-preview__code">{buildMergedConcept().slice(initialConcept.trim().length).trim()}</pre>
        </div>
      ) : null}

      {error && <p className="error qa-error">{error}</p>}

      <div className="qa-actions qa-actions--bottom">
        <button type="button" className="btn btn-primary btn-create-now" onClick={handleSubmit} disabled={submitting}>
          <PixelIcon name="rocket" size={14} /> {submitting ? t('submit.submitting') : t('qa.createNow')}
        </button>
      </div>
    </div>
  );
}
