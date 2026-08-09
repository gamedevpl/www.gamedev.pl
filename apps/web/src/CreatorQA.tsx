import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BuilderChoice, type BuilderUnavailableReason } from './BuilderChoice.js';
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
  /** The submission is in flight; the wizard stays up rather than vanishing into a gap. */
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
  // Blocks advancing past builder/review until the creator picks self.
  platformUnavailable?: BuilderUnavailableReason;
}

/**
 * One screen of the wizard. The questions come from the refiner, so how many there are
 * — and whether there are any — is only known at render time.
 */
type Stage = { kind: 'name' } | { kind: 'question'; question: QAQuestion } | { kind: 'builder' } | { kind: 'review' };

/** Tab stops the wizard is allowed to cycle between; the stage heading (tabindex -1) is not one. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The confirm step, as a full-screen wizard: one decision per screen.
 *
 * It was a single long panel below the hero, which put four questions, a name field, a
 * builder choice and a submit button on one page — and left the hero's own "Build my
 * game" button live above it, so two green CTAs competed for the same click. A
 * full-screen overlay is what removes that competition rather than restyling around it,
 * and one-decision-per-screen is what a phone can show without the creator scrolling
 * past the thing they were asked to answer.
 *
 * Nothing here advances on its own. Selecting an option selects it; moving on is always
 * an explicit Next (or Skip), because a screen that changes under a tap costs more in
 * second-guessing than it saves in clicks.
 */
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
  platformUnavailable,
}: CreatorQAProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>(initialAnswers?.selected ?? {});
  const [customText, setCustomText] = useState<Record<string, string>>(initialAnswers?.custom ?? {});
  const [builder, setBuilder] = useState<BuilderKind>(isBuilderKind(initialBuilder) ? initialBuilder : 'platform');
  const [step, setStep] = useState(0);
  const titleReady = isSubmittableTitle(title);
  // Never switched over automatically — the creator must pick self.
  const builderBlocked = builder === 'platform' && Boolean(platformUnavailable);

  const stages = useMemo<Stage[]>(
    () => [
      { kind: 'name' },
      ...questions.map((question) => ({ kind: 'question' as const, question })),
      { kind: 'builder' as const },
      { kind: 'review' as const },
    ],
    [questions],
  );

  // Guards against a restored session pointing past the end of a shorter question list.
  const stepIndex = Math.min(step, stages.length - 1);
  const stage = stages[stepIndex];
  const reviewIndex = stages.length - 1;

  const wizardRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // The page behind the overlay must not scroll with it; same approach as the studio's
  // sheet so there is one way this is done in the app.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Whatever had focus when the wizard opened gets it back when the wizard closes,
  // rather than dropping the caret at the top of a page the creator did not move to.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  /**
   * Size the shell against the visual viewport, the only one that knows about the
   * on-screen keyboard.
   *
   * The `100dvh` in the stylesheet tracks browser chrome — the retracting address bar —
   * and stops there. iOS shrinks only the *visual* viewport for the keyboard and leaves
   * the layout viewport, which is what a `position: fixed` box is sized against, at full
   * height. Two of these stages are a text field, so without this the footer carrying
   * Back and Next sits behind the keyboard for much of the flow, and the creator has to
   * dismiss it to move on.
   *
   * `offsetTop` matters as much as height: iOS scrolls the visual viewport to reveal a
   * focused input even with the body locked, and a fixed box does not follow it.
   *
   * Written straight to the node rather than through state — `scroll` fires per frame
   * while the keyboard animates, and re-rendering the whole wizard on each one would
   * trade a layout bug for a jank bug. dvh stays in the stylesheet as the fallback for
   * browsers without the API.
   */
  const [tracksViewport, setTracksViewport] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = wizardRef.current;
    if (!viewport || !root) return;

    const sync = () => {
      root.style.setProperty('--qa-viewport-height', `${viewport.height}px`);
      root.style.setProperty('--qa-viewport-offset', `${viewport.offsetTop}px`);
    };

    sync();
    setTracksViewport(true);
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, []);

  /**
   * Keeps Tab inside the overlay.
   *
   * `aria-modal` tells assistive tech this is modal; it does not stop the browser
   * tabbing on into the app shell underneath, which is still fully focusable behind a
   * covering element. Without this, tabbing past the last control lands on the hero's
   * own prompt box and build button — the ones this screen exists to take over from.
   */
  const handleTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const root = wizardRef.current;
    if (!root) return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

    // While a submission or a relocalization is in flight every control here is
    // disabled, so there is nothing left to cycle between — and simply returning would
    // hand Tab back to the browser, which is the one case where it escapes into the
    // shell behind. The overlay itself takes the focus and holds it until a control
    // comes back. The root carries tabIndex -1 for exactly this.
    if (focusable.length === 0) {
      event.preventDefault();
      root.focus?.();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const outside = !root.contains(active);

    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };

  // Every stage starts at its own top, and the new heading takes focus so a screen
  // reader announces the question rather than leaving the caret on the button that
  // moved us here. Escape is deliberately *not* bound to close: the only exit drops
  // the pending spec, and that is too destructive for a stray keypress.
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    headingRef.current?.focus?.();
  }, [stepIndex]);

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
      // a chosen option clears it, so there is always a way back to "no opinion".
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
   * An option and free text are one answer, not two competing ones.
   *
   * Free text used to *replace* the selection, so choosing "Pixel Art" and then typing
   * "but with an Amiga palette" threw the choice away and sent only the qualifier —
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

  const goTo = (next: number) => {
    if (submitting) return;
    // The name gates the build, so it also gates leaving the screen that sets it.
    if (stage.kind === 'name' && next > stepIndex && !titleReady) return;
    setStep(Math.max(0, Math.min(next, reviewIndex)));
  };

  const currentAnswer = stage.kind === 'question' ? answerFor(stage.question.id) : '';
  // The shortcut only earns its place while there are questions left to skip; from the
  // builder step onward Next already leads straight to review.
  const showShortcut = questions.length > 0 && (stage.kind === 'name' || stage.kind === 'question');

  const nextLabel = () => {
    if (stage.kind === 'name') return t('qa.continue');
    if (stage.kind === 'question') return currentAnswer ? t('qa.next') : t('qa.skip');
    return t('qa.reviewAction');
  };

  return createPortal(
    <div
      className={`qa-wizard${tracksViewport ? ' is-viewport-tracked' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t(questions.length > 0 ? 'qa.title' : 'qa.titleNameOnly')}
      ref={wizardRef}
      onKeyDown={handleTabKey}
      // Somewhere for focus to rest when every control is disabled mid-submission.
      tabIndex={-1}
    >
      <header className="qa-wizard-header">
        <p className="qa-wizard-step" aria-live="polite">
          {t('qa.stepOf', { current: stepIndex + 1, total: stages.length })}
        </p>
        {onCancel && (
          // This dismisses the wizard and drops the pending spec — it does *not* submit.
          <button
            type="button"
            className="btn-secondary qa-wizard-exit"
            onClick={onCancel}
            disabled={submitting}
            // The label is hidden on narrow screens and the icon is decorative, which
            // left the only way back to editing as an unnamed button on a phone.
            aria-label={t('qa.backToEditing')}
          >
            <PixelIcon name="close" size={12} />
            <span>{t('qa.backToEditing')}</span>
          </button>
        )}
      </header>

      <div className="qa-wizard-progress" aria-hidden="true">
        {stages.map((_, index) => (
          <span key={index} className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-now' : undefined} />
        ))}
      </div>

      <div className="qa-wizard-scroller" ref={scrollerRef}>
        <div className="qa-stage" key={stepIndex}>
          {stage.kind === 'name' && (
            <>
              <p className="qa-stage-eyebrow">{t('qa.eyebrowIdea')}</p>
              <h2 className="qa-title" ref={headingRef} tabIndex={-1}>
                {t(questions.length > 0 ? 'qa.nameStageTitle' : 'qa.titleNameOnly')}
              </h2>
              {/* Grounding: the wizard opens on top of the idea they typed, so it shows
                  the idea it is about to build rather than asking them to remember it. */}
              <blockquote className="qa-idea-quote">{initialConcept.trim()}</blockquote>
              <div className="qa-name">
                <label className="qa-name-label" htmlFor="qa-game-title">
                  {t('qa.nameLabel')}
                </label>
                <input
                  id="qa-game-title"
                  ref={nameInputRef}
                  type="text"
                  className="input-text qa-name-input"
                  value={title}
                  maxLength={MAX_TITLE_LENGTH}
                  placeholder={t('qa.namePlaceholder')}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      goTo(stepIndex + 1);
                    }
                  }}
                  disabled={submitting}
                />
                <p className="qa-name-hint">{t('qa.nameHint')}</p>
              </div>
            </>
          )}

          {stage.kind === 'question' && (
            <>
              <p className="qa-stage-eyebrow">
                {t('qa.questionCount', { current: stepIndex, total: questions.length })}
              </p>
              <h2 className="qa-title" ref={headingRef} tabIndex={-1}>
                {stage.question.question}
              </h2>
              <p className="qa-stage-lede">{stage.question.multiple ? t('qa.pickSeveral') : t('qa.pickOneOrSkip')}</p>

              <div className="qa-options">
                {stage.question.options.map((opt) => {
                  // Stays lit while free text is typed: the two are now one answer,
                  // and un-highlighting the option was how the old behaviour hid itself.
                  const isSelected = (selectedAnswers[stage.question.id] ?? []).includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      // Selection lived only in a class, so a screen reader announced
                      // every option identically whether or not it was chosen.
                      aria-pressed={isSelected}
                      className={`qa-option${isSelected ? ' qa-option--selected' : ''}${
                        stage.question.multiple ? ' qa-option--multi' : ''
                      }`}
                      disabled={submitting}
                      onClick={() => handleSelectOption(stage.question, opt.label)}
                    >
                      <span className="qa-option__tick" aria-hidden="true" />
                      <span className="qa-option__text">
                        <span className="qa-option__label">{opt.label}</span>
                        {opt.detail && <span className="qa-option__detail">{opt.detail}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              {stage.question.allowFreeText !== false && (
                <div className="qa-custom-input">
                  <input
                    type="text"
                    className="input-text"
                    placeholder={t('qa.otherPlaceholder')}
                    // The placeholder is the only visible cue, and placeholders are
                    // not names — without this the field is announced unlabelled.
                    aria-label={`${stage.question.question} — ${t('qa.otherPlaceholder')}`}
                    value={customText[stage.question.id] ?? ''}
                    disabled={submitting}
                    onChange={(e) => handleCustomTextChange(stage.question.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        goTo(stepIndex + 1);
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}

          {stage.kind === 'builder' && (
            <>
              <p className="qa-stage-eyebrow">{t('qa.eyebrowBuilder')}</p>
              <h2 className="qa-title" ref={headingRef} tabIndex={-1}>
                {t('builder.legend')}
              </h2>
              <p className="qa-stage-lede">{t('qa.builderLede')}</p>
              <BuilderChoice
                value={builder}
                onChange={handleBuilderChange}
                disabled={submitting}
                hideLegend
                platformUnavailable={platformUnavailable}
              />
              {builderBlocked && <p className="qa-builder-blocked">{t('qa.builderBlocked')}</p>}
            </>
          )}

          {stage.kind === 'review' && (
            <>
              <p className="qa-stage-eyebrow">{t('qa.reviewEyebrow')}</p>
              <h2 className="qa-title" ref={headingRef} tabIndex={-1}>
                {t('qa.reviewTitle')}
              </h2>
              <p className="qa-stage-lede">{t('qa.reviewSubtitle')}</p>

              <dl className="qa-review">
                <div className="qa-review-row">
                  <dt className="qa-review-label">{t('qa.nameLabel')}</dt>
                  <dd className="qa-review-value">
                    <span>{title.trim()}</span>
                    <button
                      type="button"
                      className="qa-review-edit"
                      disabled={submitting}
                      onClick={() => goTo(0)}
                      aria-label={`${t('qa.edit')}: ${t('qa.nameLabel')}`}
                    >
                      {t('qa.edit')}
                    </button>
                  </dd>
                </div>

                {questions.map((q, index) => {
                  const answer = answerFor(q.id);
                  return (
                    <div className="qa-review-row" key={q.id}>
                      <dt className="qa-review-label">{q.question}</dt>
                      <dd className="qa-review-value">
                        <span className={answer ? undefined : 'qa-review-unset'}>{answer || t('qa.aiDecides')}</span>
                        <button
                          type="button"
                          className="qa-review-edit"
                          disabled={submitting}
                          onClick={() => goTo(index + 1)}
                          aria-label={`${t('qa.edit')}: ${q.question}`}
                        >
                          {t('qa.edit')}
                        </button>
                      </dd>
                    </div>
                  );
                })}

                <div className="qa-review-row">
                  <dt className="qa-review-label">{t('builder.legend')}</dt>
                  <dd className="qa-review-value">
                    <span>{t(builder === 'self' ? 'builder.self.title' : 'builder.platform.title')}</span>
                    <button
                      type="button"
                      className="qa-review-edit"
                      disabled={submitting}
                      onClick={() => goTo(reviewIndex - 1)}
                      aria-label={`${t('qa.edit')}: ${t('builder.legend')}`}
                    >
                      {t('qa.edit')}
                    </button>
                  </dd>
                </div>
              </dl>

              {error && <p className="error qa-error">{error}</p>}
            </>
          )}
        </div>
      </div>

      <footer className="qa-wizard-footer">
        {stepIndex > 0 && (
          <button
            type="button"
            className="btn btn-secondary qa-back"
            onClick={() => goTo(stepIndex - 1)}
            disabled={submitting}
          >
            <PixelIcon name="arrowLeft" size={12} /> {t('qa.back')}
          </button>
        )}

        {showShortcut && (
          // The impatience escape hatch: straight to review, where Create Now is. It
          // lands on the summary rather than submitting blind, so skipping the rest
          // still shows what is about to be built.
          <button
            type="button"
            className="qa-shortcut"
            onClick={() => goTo(reviewIndex)}
            disabled={submitting || !titleReady || builderBlocked}
          >
            {t('qa.skipToReview')}
          </button>
        )}

        {stage.kind === 'review' ? (
          <button
            type="button"
            className="btn btn-primary qa-primary btn-create-now"
            onClick={handleSubmit}
            disabled={submitting || !titleReady || builderBlocked}
          >
            <PixelIcon name="send" size={14} /> {submitting ? t('submit.submitting') : t('qa.createNow')}
          </button>
        ) : (
          <button
            type="button"
            className={`btn btn-primary qa-primary qa-next${
              stage.kind === 'question' && !currentAnswer ? ' qa-next--skip' : ''
            }`}
            onClick={() => goTo(stepIndex + 1)}
            disabled={
              submitting || (stage.kind === 'name' && !titleReady) || (stage.kind === 'builder' && builderBlocked)
            }
          >
            {nextLabel()} <PixelIcon name="arrowRight" size={12} />
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
