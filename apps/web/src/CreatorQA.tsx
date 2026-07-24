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
}

export function CreatorQA({ questions, initialConcept, onSubmitWithConcept, onCancel }: CreatorQAProps) {
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

  const buildMergedConcept = (): string => {
    const clarifications: string[] = [];

    for (const q of questions) {
      const selected = selectedAnswers[q.id];
      const custom = customText[q.id]?.trim();
      const answer = custom || selected;
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
        <button type="button" className="btn btn-primary btn-create-now" onClick={handleSubmit}>
          <PixelIcon name="rocket" size={14} /> {t('qa.createNow')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('qa.skipAll')}
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
                  const isSelected = selected === opt.label && !custom.trim();
                  return (
                    <button
                      key={opt.label}
                      type="button"
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

      <div className="qa-actions qa-actions--bottom">
        <button type="button" className="btn btn-primary btn-create-now" onClick={handleSubmit}>
          <PixelIcon name="rocket" size={14} /> {t('qa.createNow')}
        </button>
      </div>
    </div>
  );
}
