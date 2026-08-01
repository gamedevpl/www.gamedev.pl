import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BuilderChoice } from './BuilderChoice.js';
import { isBuilderKind, type BuilderKind } from './builderKind.js';
import { isSubmittableTitle, MAX_TITLE_LENGTH } from './gameTitle.js';
import { PixelIcon } from './PixelIcon.js';
import type { PendingQaAnswers } from './pendingQa.js';

export interface QAOption {
  label: string;
  detail?: string;
}

export interface QAQuestion {
  id: string;
  question: string;
  options: QAOption[];
  allowFreeText?: boolean;
  /** Some dimensions are naturally plural ("which mechanics?"); the refiner marks those. */
  multiple?: boolean;
}

interface CreatorQAProps {
  questions: QAQuestion[];
  initialConcept: string;
  /**
   * The name to start from — the refiner's proposal, or one derived from the prompt
   * when it had none. Editable here, and confirming it is what starts the build.
   */
  initialTitle: string;
  onSubmitWithConcept: (finalConcept: string, title: string, builder: BuilderKind) => void;
  /** Fires on every edit so the caller can park the name with the rest of the session. */
  onTitleChange?: (title: string) => void;
  onCancel?: () => void;
  /** The submission is in flight; the panel stays up rather than vanishing into a gap. */
  submitting?: boolean;
  /** Shown here as well as in the hero, because this is where the creator is looking. */
  error?: string | null;
  /** Answers restored from a previous visit, so a reload doesn't cost the work again. */
  initialAnswers?: PendingQaAnswers;
  /** Fires on every edit so the caller can park the session; keep it referentially stable. */
  onAnswersChange?: (answers: PendingQaAnswers) => void;
  /** Who builds this round — restored with the parked session when present. */
  initialBuilder?: BuilderKind;
  /** Fires when the builder choice changes so a reload keeps the selection. */
  onBuilderChange?: (builder: BuilderKind) => void;
}

export function CreatorQA({
  questions,
  initialConcept,
  initialTitle,
  onSubmitWithConcept,
  onTitleChange,
  onCancel,
  submitting = false,
  error = null,
  initialAnswers,
  onAnswersChange,
  initialBuilder = 'platform',
  onBuilderChange,
}: CreatorQAProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>(initialAnswers?.selected ?? {});
  const [customText, setCustomText] = useState<Record<string, string>>(initialAnswers?.custom ?? {});
  const [builder, setBuilder] = useState<BuilderKind>(isBuilderKind(initialBuilder) ? initialBuilder : 'platform');
  const titleReady = isSubmittableTitle(title);

  const handleBuilderChange = (next: BuilderKind) => {
    setBuilder(next);
    onBuilderChange?.(next);
  };

  const report = (selected: Record<string, string[]>, custom: Record<string, string>) => {
    onAnswersChange?.({ selected, custom });
  };

  const handleSelectOption = (question: QAQuestion, label: string) => {
    setSelectedAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const isOn = current.includes(label);
      // Single-choice questions replace; multi-choice accumulate. Either way clicking
      // a chosen chip clears it, so there is always a way back to "no opinion".
      const next = question.multiple
        ? isOn
          ? current.filter((item) => item !== label)
          : [...current, label]
        : isOn
          ? []
          : [label];
      const updated = { ...prev, [question.id]: next };
      report(updated, customText);
      return updated;
    });
  };

  const handleCustomTextChange = (questionId: string, text: string) => {
    setCustomText((prev) => {
      const updated = { ...prev, [questionId]: text };
      report(selectedAnswers, updated);
      return updated;
    });
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
    const selected = (selectedAnswers[questionId] ?? []).join(', ');
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

  const handleTitleChange = (next: string) => {
    setTitle(next);
    onTitleChange?.(next);
  };

  const handleSubmit = () => {
    if (!titleReady) return;
    onSubmitWithConcept(buildMergedConcept(), title.trim(), builder);
  };

  return (
    <div className="qa-container panel">
      <div className="qa-header">
        {/* Two jobs, two headings: naming the game is the one that always happens, and
            the questions only exist when the refiner found something underspecified. */}
        <h3 className="qa-title">{t(questions.length > 0 ? 'qa.title' : 'qa.titleNameOnly')}</h3>
        <p className="qa-subtitle">{t(questions.length > 0 ? 'qa.subtitle' : 'qa.subtitleNameOnly')}</p>
      </div>

      {/* The name goes first because it is the prerequisite, not a detail: nothing is
          built until the creator has confirmed one, which is what stops a game being
          named after the first 40 characters of the prompt that asked for it. */}
      <div className="qa-name">
        <label className="qa-name-label" htmlFor="qa-game-title">
          {t('qa.nameLabel')}
        </label>
        <input
          id="qa-game-title"
          type="text"
          className="input-text qa-name-input"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          placeholder={t('qa.namePlaceholder')}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={submitting}
        />
        <p className="qa-name-hint">{t('qa.nameHint')}</p>
      </div>

      {/* Questions directly under the header that announces them: the subtitle says
          "click any proposed options", so the options must be the next thing on
          screen — not parked below a green button that looks like the end of the
          panel. The builder choice and the actions follow, in the order they are
          decided: what the game is, who builds it, go. */}
      {questions.length > 0 && (
        <div className="qa-questions-list">
          {questions.map((q) => {
            const selected = selectedAnswers[q.id] ?? [];
            const custom = customText[q.id] ?? '';

            return (
              <div key={q.id} className="qa-card">
                <h4 className="qa-card__question">
                  {q.question}
                  {q.multiple && <span className="qa-card__hint"> {t('qa.pickSeveral')}</span>}
                </h4>
                <div className="qa-chips">
                  {q.options.map((opt) => {
                    // Stays lit while free text is typed: the two are now one answer,
                    // and un-highlighting the chip was how the old behaviour hid itself.
                    const isSelected = selected.includes(opt.label);
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        // Selection lived only in a class, so a screen reader announced
                        // every chip identically whether or not it was chosen.
                        aria-pressed={isSelected}
                        className={`qa-chip ${isSelected ? 'qa-chip--selected' : ''}`}
                        disabled={submitting}
                        onClick={() => handleSelectOption(q, opt.label)}
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
                      disabled={submitting}
                      onChange={(e) => handleCustomTextChange(q.id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {Object.values(selectedAnswers).some(Boolean) || Object.values(customText).some((s) => s.trim().length > 0) ? (
        <div className="qa-preview">
          <h5>{t('qa.clarificationsTitle')}</h5>
          <pre className="qa-preview__code">{buildMergedConcept().slice(initialConcept.trim().length).trim()}</pre>
        </div>
      ) : null}

      <BuilderChoice value={builder} onChange={handleBuilderChange} disabled={submitting} />

      {error && <p className="error qa-error">{error}</p>}

      {/* One action bar, after everything it submits. It sticks to the bottom of the
          viewport while the panel is taller than the screen, so "Create Now" is always
          in reach without printing the same green button twice. */}
      <div className="qa-actions">
        <button
          type="button"
          className="btn btn-primary btn-create-now"
          onClick={handleSubmit}
          disabled={submitting || !titleReady}
        >
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
    </div>
  );
}
