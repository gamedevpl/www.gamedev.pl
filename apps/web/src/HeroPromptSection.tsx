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

const STOP_WORDS = new Set([
  'chce',
  'chcę',
  'chcialbym',
  'chciałbym',
  'pograc',
  'pograć',
  'zagrac',
  'zagrać',
  'gra',
  'gre',
  'grę',
  'grac',
  'grać',
  'gry',
  'gier',
  'jakas',
  'jakaś',
  'fajna',
  'fajne',
  'fajną',
  'super',
  'dla',
  'mnie',
  'w',
  'z',
  'na',
  'do',
  'o',
  'i',
  'oraz',
  'lub',
  'albo',
  'po',
  'od',
  'jak',
  'play',
  'game',
  'games',
  'want',
  'to',
  'a',
  'an',
  'the',
  'in',
  'on',
  'with',
  'for',
  'like',
  'some',
]);

function findMatchingGame(query: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return null;

  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);
  const meaningfulTokens = tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 2);
  const queryTokens = meaningfulTokens.length > 0 ? meaningfulTokens : tokens;

  for (const entry of catalog) {
    const title = entry.title.toLowerCase();
    const genre = entry.genre.toLowerCase();
    const controls = entry.controls.toLowerCase();
    const slug = entry.slug.toLowerCase();

    // 1. Direct match in title or slug
    if (title.includes(normalized) || normalized.includes(title) || slug.includes(normalized)) {
      return entry;
    }

    // 2. Keyword or search tag match
    if (
      entry.searchKeywords?.some((k) => {
        const kw = k.toLowerCase().trim();
        return kw.length > 2 && queryTokens.some((t) => kw.includes(t) || t.includes(kw));
      })
    ) {
      return entry;
    }

    // 3. Special intent aliases (sports, vehicles, classics, themes)
    if (
      (normalized.includes('piłk') ||
        normalized.includes('pilk') ||
        normalized.includes('football') ||
        normalized.includes('soccer') ||
        normalized.includes('mecz') ||
        normalized.includes('mundial') ||
        normalized.includes('gol')) &&
      (slug.includes('mexico') || slug.includes('soccer') || slug.includes('football'))
    ) {
      return entry;
    }
    if (
      (normalized.includes('samochod') ||
        normalized.includes('aut') ||
        normalized.includes('wyścig') ||
        normalized.includes('wyscig') ||
        normalized.includes('racer') ||
        normalized.includes('drive') ||
        normalized.includes('car')) &&
      (slug.includes('racer') || slug.includes('carjack') || slug.includes('karts'))
    ) {
      return entry;
    }
    if (
      (normalized.includes('farma') ||
        normalized.includes('rolnik') ||
        normalized.includes('sadz') ||
        normalized.includes('farm')) &&
      slug.includes('farm')
    ) {
      return entry;
    }
    if (
      (normalized.includes('czołg') ||
        normalized.includes('czolg') ||
        normalized.includes('tank') ||
        normalized.includes('cannon')) &&
      (slug.includes('cannon') || slug.includes('tank'))
    ) {
      return entry;
    }
    if (
      (normalized.includes('szachy') ||
        normalized.includes('warcab') ||
        normalized.includes('checker') ||
        normalized.includes('chess')) &&
      slug.includes('checker')
    ) {
      return entry;
    }
    if (
      (normalized.includes('flipper') || normalized.includes('pinball') || normalized.includes('bila')) &&
      slug.includes('pinball')
    ) {
      return entry;
    }
    if (
      (normalized.includes('wąż') ||
        normalized.includes('waz') ||
        normalized.includes('snake') ||
        normalized.includes('serpent')) &&
      slug.includes('serpent')
    ) {
      return entry;
    }
    if (normalized.includes('mario') && (slug.includes('plumber') || title.includes('plumber'))) {
      return entry;
    }
    if (normalized.includes('coin') && slug.includes('coin')) {
      return entry;
    }
    if ((normalized.includes('rock') || normalized.includes('dodge')) && slug.includes('rock')) {
      return entry;
    }
    if (
      (normalized.includes('space') ||
        normalized.includes('kosmos') ||
        normalized.includes('ship') ||
        normalized.includes('rocket') ||
        normalized.includes('fly')) &&
      (slug.includes('asteroid') || slug.includes('starweb') || slug.includes('space'))
    ) {
      return entry;
    }

    // 4. Token match against metadata
    const keywords = (entry.searchKeywords || []).map((k) => k.toLowerCase()).join(' ');
    const taglines = `${entry.tagline?.en || ''} ${entry.tagline?.pl || ''}`.toLowerCase();
    const matchCount = queryTokens.filter(
      (t) =>
        title.includes(t) || genre.includes(t) || controls.includes(t) || keywords.includes(t) || taglines.includes(t),
    ).length;
    if (matchCount > 0 && matchCount >= Math.ceil(queryTokens.length / 2)) {
      return entry;
    }
  }

  return null;
}

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

  // Show quota before a 429 after they finish typing.
  const [quota, setQuota] = useState<{ used: number; limit: number | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getQuota()
      .then((result) => {
        if (cancelled) return;
        setQuota(result.submissions);
        onPlatformBuilderAvailability?.(result.platformBuilder);
      })
      .catch(() => {
        // Signed out or unreachable — the line simply doesn't render.
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

  const localMatchedGame = useMemo(() => findMatchingGame(promptText, catalogEntries), [promptText, catalogEntries]);
  const [vectorMatchedGame, setVectorMatchedGame] = useState<CatalogEntry | null>(null);

  useEffect(() => {
    const trimmed = promptText.trim();
    if (trimmed.length < 3) {
      setVectorMatchedGame(null);
      return;
    }

    const controller = new AbortController();
    const handle = setTimeout(() => {
      fetch(`/api/catalog/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { match?: CatalogEntry | null; score?: number } | null) => {
          if (data?.match && typeof data.score === 'number' && data.score >= 0.65) {
            const found = catalogEntries.find((e) => e.slug === data.match?.slug);
            if (found) {
              setVectorMatchedGame({
                ...found,
                tagline: data.match.tagline || found.tagline,
                shortControls: data.match.shortControls || found.shortControls,
                searchKeywords: data.match.searchKeywords || found.searchKeywords,
              });
              return;
            }
          }
          setVectorMatchedGame(null);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setVectorMatchedGame(null);
          }
        });
    }, 200);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [promptText, catalogEntries]);

  const matchedGame = vectorMatchedGame || localMatchedGame;

  const matchedPoster = useMemo(() => {
    if (!matchedGame?.media?.screenshots?.length) return null;
    const idx = defaultScreenshotIndex(matchedGame.media.screenshots);
    const file = matchedGame.media.screenshots[idx]?.file;
    return file ? catalogMediaUrl(matchedGame.slug, file, 320) : null;
  }, [matchedGame]);

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

  // Desktop clips Build label; spinner + status must stay visible.
  const isBusy = submissionStatus !== 'idle' || isPreparingAttachments;
  const busyLabel =
    submissionStatus === 'refining'
      ? t('qa.analyzing')
      : submissionStatus === 'loading'
        ? t('submit.submitting')
        : null;

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
              className={`primary-btn build-btn${isBusy ? ' is-busy' : ''}`}
              title={busyLabel ?? t('hero.buildGameButton')}
              aria-label={busyLabel ?? t('hero.buildGameButton')}
              disabled={isBusy || pendingAttachmentReads > 0 || (!promptText.trim() && attachments.length === 0)}
            >
              {isBusy ? <span className="build-btn-spinner" aria-hidden="true" /> : <PixelIcon name="send" size={16} />}
              {/* refining ≠ submitting; phone shows label, desktop clips to icon */}
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

          {matchedGame && (
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
          )}

          {!matchedGame && promptText.trim().length >= 3 && (
            <div className={`smart-intent-card creation-card${isBusy ? ' is-busy' : ''}`}>
              <div className="creation-info">
                <span className="smart-badge creation-badge">
                  <PixelIcon name="sparkle" size={14} /> {t('hero.smartNoMatchTitle', { query: promptText.trim() })}
                </span>
                <p className="creation-sub">{t('hero.smartNoMatchSub')}</p>
              </div>
            </div>
          )}

          {quota && quota.limit !== null ? (
            <span className={`quota-note${quota.used >= quota.limit ? ' is-spent' : ''}`}>
              {t('hero.quotaLeft', { left: Math.max(0, quota.limit - quota.used), limit: quota.limit })}
            </span>
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
