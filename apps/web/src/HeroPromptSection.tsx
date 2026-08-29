import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { recordCreateStep, type PlayVia } from './visitTelemetry.js';
import { catalogMediaUrl, defaultScreenshotIndex, type CatalogEntry } from './catalog.js';
import { SketchModal } from './SketchModal.js';
import { PixelIcon } from './PixelIcon.js';
import { getQuota, type PlatformBuilderAvailability } from './submissionApi.js';
import { toBase64PngList } from './attachmentImages.js';
import { useClampToViewport } from './useClampToViewport.js';

// Mirrors MAX_REFERENCE_IMAGES in submissions.ts.
const MAX_ATTACHMENTS = 4;

// Gemini-style composer: attach, prompt, mic, build in one pill.

type HeroPromptSectionProps = {
  initialPrompt?: string;
  catalogEntries?: CatalogEntry[];
  onPlayGame?: (entry: CatalogEntry, via?: PlayVia) => void;
  // refining = pre-submit spec refiner; nothing sent yet
  submissionStatus: 'idle' | 'refining' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (concept: string, referenceImages?: string[]) => void;
  // Fires once the quota poll resolves.
  onPlatformBuilderAvailability?: (availability: PlatformBuilderAvailability | undefined) => void;
  // Click-to-fill prompt starters; unused on home, /create shows a few.
  exampleChips?: string[];
};

export type VisualAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

import { findMatchingGame } from './findMatchingGame.js';

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEvent {
  results: ArrayLike<SpeechRecognitionResult>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function HeroPromptSection({
  initialPrompt = '',
  catalogEntries = [],
  onPlayGame,
  submissionStatus,
  submissionError,
  onSubmitSpec,
  onPlatformBuilderAvailability,
  exampleChips,
}: HeroPromptSectionProps) {
  const { t, i18n } = useTranslation();
  // Skip autofocus on phone — keyboard would hide the composer.
  const shouldAutoFocusPrompt = typeof matchMedia !== 'function' || !matchMedia('(max-width: 768px)').matches;
  const [promptText, setPromptText] = useState(initialPrompt);
  const [attachments, setAttachments] = useState<VisualAttachment[]>([]);
  // FileReader work not yet landed in attachments.
  const [pendingAttachmentReads, setPendingAttachmentReads] = useState(0);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const [isSketchOpen, setIsSketchOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const attachPanelRef = useClampToViewport<HTMLDivElement>(attachMenuOpen);

  // Platform builder availability poll.
  useEffect(() => {
    let cancelled = false;
    getQuota()
      .then((result) => {
        if (cancelled) return;
        onPlatformBuilderAvailability?.(result.platformBuilder);
      })
      .catch(() => {
        // Signed out or unreachable.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web Speech Recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechBasePromptRef = useRef('');

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [attachMenuOpen]);

  const toggleSpeechRecognition = () => {
    setMicNotice(null);
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechClass) {
      setMicNotice(t('hero.micUnsupported'));
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechClass();
      recognition.continuous = false;
      // Interim results keep iOS Safari feeling responsive while speaking.
      recognition.interimResults = true;
      recognition.lang = window.navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = Array.from(event.results ?? [])
          .map((result) => result[0]?.transcript ?? '')
          .join('')
          .trim();
        if (transcript) {
          recordCreateStep('prompt_started');
          setPromptText(speechBasePromptRef.current ? `${speechBasePromptRef.current} ${transcript}` : transcript);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        recognitionRef.current = null;
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setMicNotice(t('hero.micDenied'));
        } else {
          setMicNotice(`Speech error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };

      speechBasePromptRef.current = promptText.trim();
      recognitionRef.current = recognition;
      // Mark listening now; Safari onstart can wait on permission.
      setIsListening(true);
      recognition.start();
    } catch (err: unknown) {
      setIsListening(false);
      setMicNotice(err instanceof Error ? err.message : 'Voice recognition error');
    }
  };

  const isBusy = submissionStatus !== 'idle' || isPreparingAttachments;
  const busyLabel =
    submissionStatus === 'refining'
      ? t('qa.analyzing')
      : submissionStatus === 'loading'
        ? t('submit.submitting')
        : null;

  const localMatchedGame = useMemo(() => findMatchingGame(promptText, catalogEntries), [promptText, catalogEntries]);
  const [vectorMatch, setVectorMatch] = useState<{ query: string; match: CatalogEntry | null }>({
    query: '',
    match: null,
  });

  const trimmedPrompt = promptText.trim();
  const needsVectorSearch = trimmedPrompt.length >= 3 && !localMatchedGame && !isBusy;
  const isSearching = needsVectorSearch && vectorMatch.query !== trimmedPrompt;
  const rawVectorGame = needsVectorSearch && vectorMatch.query === trimmedPrompt ? vectorMatch.match : null;

  // Enriches matched game with screenshots from catalog.
  const vectorMatchedGame = useMemo(() => {
    if (!rawVectorGame) return null;
    const full = catalogEntries.find((e) => e.slug === rawVectorGame.slug);
    return full ? { ...full, ...rawVectorGame } : rawVectorGame;
  }, [rawVectorGame, catalogEntries]);

  const matchedGame = localMatchedGame || vectorMatchedGame;

  useEffect(() => {
    if (!needsVectorSearch) return;

    const controller = new AbortController();
    const handle = setTimeout(() => {
      fetch(`/api/catalog/search?q=${encodeURIComponent(trimmedPrompt)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { match?: CatalogEntry | null; score?: number } | null) => {
          if (data?.match && typeof data.score === 'number' && data.score >= 0.55) {
            const found = catalogEntries.find((e) => e.slug === data.match?.slug);
            const entry = found
              ? {
                  ...found,
                  tagline: data.match.tagline || found.tagline,
                  shortControls: data.match.shortControls || found.shortControls,
                  searchKeywords: data.match.searchKeywords || found.searchKeywords,
                }
              : (data.match as CatalogEntry);
            setVectorMatch({ query: trimmedPrompt, match: entry });
            return;
          }
          setVectorMatch({ query: trimmedPrompt, match: null });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setVectorMatch({ query: trimmedPrompt, match: null });
          }
        });
    }, 200);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [trimmedPrompt, catalogEntries, needsVectorSearch]);

  const matchedPoster = useMemo(() => {
    if (!matchedGame?.media?.screenshots?.length) return null;
    const idx = defaultScreenshotIndex(matchedGame.media.screenshots);
    const file = matchedGame.media.screenshots[idx]?.file;
    return file ? catalogMediaUrl(matchedGame.slug, file, 320) : null;
  }, [matchedGame]);

  const isCreationIntentEligible = useMemo(() => {
    const trimmed = promptText.trim();
    if (attachments.length > 0) return true;
    const words = trimmed.split(/\s+/).filter(Boolean);
    return words.length >= 2 && trimmed.length >= 6;
  }, [promptText, attachments.length]);

  const showTextualBuildCta = Boolean((matchedGame || isCreationIntentEligible) && !isSearching && !isBusy);

  const handleFiles = (files: FileList | File[]) => {
    if (submissionStatus !== 'idle') return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      setPendingAttachmentReads((count) => count + 1);
      const reader = new FileReader();
      const done = () => setPendingAttachmentReads((count) => count - 1);
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setAttachments((prev) => [
            ...prev,
            {
              id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: file.name,
              dataUrl,
            },
          ]);
        }
        done();
      };
      reader.onerror = done;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Close attach while busy so upload/draw cannot change mid-request.
  useEffect(() => {
    if (!isBusy) return;
    setAttachMenuOpen(false);
    setIsDragging(false);
    setIsSketchOpen(false);
  }, [isBusy]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isBusy) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleSaveSketch = (dataUrl: string) => {
    if (isBusy) return;
    setAttachments((prev) => [
      ...prev,
      {
        id: `sketch-${Date.now()}`,
        name: `Sketch ${prev.length + 1}`,
        dataUrl,
      },
    ]);
  };

  const removeAttachment = (id: string) => {
    if (isBusy) return;
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePrimarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy || pendingAttachmentReads > 0) return;
    const trimmed = promptText.trim();
    if (!trimmed && attachments.length === 0) return;

    const hasAttachments = attachments.length > 0;
    if (hasAttachments) setIsPreparingAttachments(true);
    try {
      // Normalizes to PNG so an uploaded JPEG/WebP passes the backend's signature check.
      const referenceImages = await toBase64PngList(attachments.slice(0, MAX_ATTACHMENTS).map((a) => a.dataUrl));

      let finalPrompt = trimmed;
      if (attachments.length > 0) {
        const attachSummary = attachments.map((a) => a.name).join(', ');
        finalPrompt = trimmed
          ? `${trimmed}\n\n[Visual attachments: ${attachSummary}]`
          : `Game idea with attached visuals: ${attachSummary}`;
      }

      // Funnel step: they asked for a game, signed-in or not.
      recordCreateStep('spec_submitted');
      // Naming happens in confirm; do not invent a title from the prompt.
      onSubmitSpec(finalPrompt, referenceImages.length > 0 ? referenceImages : undefined);
    } finally {
      if (hasAttachments) setIsPreparingAttachments(false);
    }
  };

  return (
    <section className="hero-prompt-section">
      <div
        className={`hero-prompt-card ${isDragging && !isBusy ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <form onSubmit={handlePrimarySubmit} className="prompt-box-form" aria-busy={isBusy || undefined}>
          <div className={`prompt-composer-bar${isBusy ? ' is-busy' : ''}`}>
            <div className="prompt-attach" ref={attachMenuRef}>
              <button
                type="button"
                className={`prompt-icon-btn attach-btn${attachMenuOpen ? ' is-open' : ''}`}
                onClick={() => setAttachMenuOpen((open) => !open)}
                title={t('hero.attachMenuAria')}
                aria-label={t('hero.attachMenuAria')}
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
                disabled={isBusy}
              >
                <PixelIcon name="plus" size={18} />
              </button>
              {attachMenuOpen && !isBusy ? (
                <div className="prompt-attach-menu" role="menu" aria-label={t('hero.attachMenu')} ref={attachPanelRef}>
                  <button
                    type="button"
                    className="prompt-attach-item"
                    role="menuitem"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <PixelIcon name="image" size={16} /> {t('hero.uploadImage')}
                  </button>
                  <button
                    type="button"
                    className="prompt-attach-item"
                    role="menuitem"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      setIsSketchOpen(true);
                    }}
                  >
                    <PixelIcon name="palette" size={16} /> {t('hero.drawSketch')}
                  </button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden-file-input"
                onChange={handleFileSelect}
              />
            </div>

            <input
              type="text"
              className="big-prompt-input"
              autoFocus={shouldAutoFocusPrompt}
              value={promptText}
              onChange={(e) => {
                // Once per visit: first keystroke into the creation funnel.
                if (e.target.value.trim()) recordCreateStep('prompt_started');
                setPromptText(e.target.value);
              }}
              placeholder={t('hero.bigPromptPlaceholder')}
              enterKeyHint="go"
              autoComplete="off"
              disabled={isBusy}
              onPaste={(e) => {
                const pastedImages = Array.from(e.clipboardData?.items ?? [])
                  .filter((item) => item.type.startsWith('image/'))
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => file !== null);
                if (pastedImages.length > 0) handleFiles(pastedImages);
              }}
            />

            <div className="prompt-bar-actions">
              <button
                type="button"
                className={`prompt-icon-btn mic-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleSpeechRecognition}
                title={isListening ? t('hero.micListening') : t('hero.micStart')}
                aria-label={isListening ? t('hero.micListening') : t('hero.micStart')}
                aria-pressed={isListening}
                disabled={isBusy}
              >
                <PixelIcon name="mic" size={18} />
              </button>
            </div>

            <button
              type="submit"
              className={`primary-btn build-btn${isBusy ? ' is-busy' : ''}${showTextualBuildCta ? ' has-text-cta' : ''}`}
              title={busyLabel ?? t('hero.buildGameButton')}
              aria-label={busyLabel ?? t('hero.buildGameButton')}
              disabled={isBusy || pendingAttachmentReads > 0 || (!promptText.trim() && attachments.length === 0)}
            >
              {isBusy ? (
                <span className="build-btn-spinner" aria-hidden="true" />
              ) : (
                <PixelIcon name={showTextualBuildCta ? 'sparkle' : 'send'} size={showTextualBuildCta ? 14 : 16} />
              )}
              <span className="build-btn-label">{busyLabel ?? t('hero.buildGameButton')}</span>
            </button>
          </div>

          {exampleChips && exampleChips.length > 0 && !isBusy && (
            <div className="prompt-examples">
              {exampleChips.map((example) => (
                <button
                  type="button"
                  key={example}
                  className="prompt-example-chip"
                  onClick={() => {
                    setPromptText(example);
                    recordCreateStep('prompt_started');
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {busyLabel ? (
            <p className="prompt-busy-status" role="status" aria-live="polite">
              <span className="build-btn-spinner" aria-hidden="true" />
              {busyLabel}
            </p>
          ) : null}

          {(micNotice || isListening) && !isBusy && (
            <p className="mic-notice-text" role="status" aria-live="polite">
              {micNotice ?? t('hero.micListening')}
            </p>
          )}

          {attachments.length > 0 && (
            <div className="attachments-preview-container">
              <span className="attachments-title">{t('hero.attachmentsTitle', { count: attachments.length })}</span>
              <div className="attachments-list">
                {attachments.map((item) => (
                  <div key={item.id} className="attachment-chip">
                    <img src={item.dataUrl} alt={item.name} className="attachment-thumb" />
                    <span className="attachment-name">{item.name}</span>
                    <button
                      type="button"
                      className="remove-attachment-btn"
                      onClick={() => removeAttachment(item.id)}
                      title={t('hero.removeAttachment')}
                      disabled={isBusy}
                    >
                      <PixelIcon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {matchedGame ? (
            <div className="smart-intent-card matched-card">
              {matchedPoster && (
                <div className="matched-thumb-wrap">
                  <img
                    src={matchedPoster}
                    alt={matchedGame.title}
                    className="matched-thumb"
                    loading="eager"
                    decoding="async"
                  />
                </div>
              )}
              <div className="matched-info">
                <div className="matched-badges">
                  <span className="smart-badge">
                    <PixelIcon name="gamepad" size={12} /> {t('catalog.genre')}: {matchedGame.genre}
                  </span>
                  {matchedGame.multiplayer && (
                    <span className="smart-badge smart-badge-secondary">
                      <PixelIcon name="user" size={12} /> {t('catalog.categories.multiplayer_party')}
                    </span>
                  )}
                </div>
                <h3 className="matched-title">{matchedGame.title}</h3>
                {(() => {
                  const isPl = (i18n?.language || '').startsWith('pl');
                  const tagline = isPl ? matchedGame.tagline?.pl : matchedGame.tagline?.en;
                  const shortControls = isPl ? matchedGame.shortControls?.pl : matchedGame.shortControls?.en;
                  const descText =
                    tagline ||
                    (shortControls
                      ? `${t('catalog.controls')}: ${shortControls}`
                      : matchedGame.controls
                        ? `${t('catalog.controls')}: ${matchedGame.controls}`
                        : '');
                  return descText ? <p className="matched-desc">{descText}</p> : null;
                })()}
                <p className="matched-hint">{t('hero.smartMatchHint')}</p>
              </div>
              <div className="matched-actions">
                <button
                  type="button"
                  className="primary-btn play-match-btn"
                  onClick={() => onPlayGame?.(matchedGame, 'composer_match')}
                  disabled={isBusy}
                >
                  <PixelIcon name="play" size={14} /> {t('hero.smartPlayBtn', { title: matchedGame.title })}
                </button>
              </div>
            </div>
          ) : isSearching ? (
            <div className="smart-intent-card searching-card" role="status" aria-live="polite">
              <span className="searching-spinner" aria-hidden="true" />
              <div className="searching-info">
                <span className="smart-badge searching-badge">
                  {t('hero.smartSearching')}
                </span>
                <p className="searching-sub">"{promptText.trim()}"</p>
              </div>
            </div>
          ) : isCreationIntentEligible ? (
            <div className={`smart-intent-card creation-card${isBusy ? ' is-busy' : ''}`}>
              <div className="creation-info">
                <span className="smart-badge creation-badge">
                  <PixelIcon name="sparkle" size={14} /> {t('hero.smartNoMatchTitle', { query: promptText.trim() })}
                </span>
                <p className="creation-sub">{t('hero.smartNoMatchSub')}</p>
              </div>
              <div className="creation-actions">
                <button
                  type="submit"
                  className="primary-btn build-match-btn"
                  disabled={isBusy || pendingAttachmentReads > 0 || (!promptText.trim() && attachments.length === 0)}
                >
                  <PixelIcon name="sparkle" size={14} /> {t('hero.smartBuildBtn')}
                </button>
              </div>
            </div>
          ) : null}
        </form>

        {submissionError && <p className="error">{submissionError}</p>}

        {/* AI Act art. 50(1): disclose AI at the prompt interaction point. */}
        <p className="ai-notice">
          <PixelIcon name="sparkle" size={12} /> {t('ai.creatorNotice')} <a href="/privacy">{t('legal.privacy')}</a>
        </p>

        <SketchModal isOpen={isSketchOpen} onClose={() => setIsSketchOpen(false)} onSaveSketch={handleSaveSketch} />
      </div>
    </section>
  );
}
