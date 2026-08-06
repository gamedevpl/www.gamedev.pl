import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { recordCreateStep } from './visitTelemetry.js';
import type { CatalogEntry } from './catalog.js';
import { SketchModal } from './SketchModal.js';
import { PixelIcon } from './PixelIcon.js';
import { getQuota } from './submissionApi.js';

/**
 * Gemini-style composer: one pill bar holds attach / prompt / mic / build.
 */

type HeroPromptSectionProps = {
  initialPrompt?: string;
  catalogEntries?: CatalogEntry[];
  onPlayGame?: (entry: CatalogEntry) => void;
  /** 'refining' is the pre-submission spec-refiner call; nothing has been sent yet. */
  submissionStatus: 'idle' | 'refining' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (concept: string) => void;
  mockStatus: 'idle' | 'loading' | 'error';
  mockError: string | null;
  // Kept for the demo generator; the primary Build action no longer auto-fires a
  // throwaway mock — clarifying questions (the QA gate) run before any generation.
  onGenerateMock?: (prompt: string) => void;
};

export type VisualAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

function findMatchingGame(query: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return null;

  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  for (const entry of catalog) {
    const title = entry.title.toLowerCase();
    const genre = entry.genre.toLowerCase();
    const controls = entry.controls.toLowerCase();
    const slug = entry.slug.toLowerCase();

    // 1. Direct match in title or slug
    if (title.includes(normalized) || normalized.includes(title) || slug.includes(normalized)) {
      return entry;
    }

    // 2. Special aliases
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
        normalized.includes('ship') ||
        normalized.includes('rocket') ||
        normalized.includes('fly')) &&
      slug.includes('asteroid')
    ) {
      return entry;
    }

    // 3. Token match
    const matchCount = tokens.filter((t) => title.includes(t) || genre.includes(t) || controls.includes(t)).length;
    if (matchCount > 0 && matchCount >= Math.ceil(tokens.length / 2)) {
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
  mockStatus,
  mockError,
}: HeroPromptSectionProps) {
  const { t } = useTranslation();
  // Focusing a text field during mobile page load opens the on-screen keyboard and hides
  // most of the creation surface. Keep the desktop shortcut, where no virtual keyboard
  // competes for viewport space.
  const shouldAutoFocusPrompt = typeof matchMedia !== 'function' || !matchMedia('(max-width: 768px)').matches;
  const [promptText, setPromptText] = useState(initialPrompt);
  const [attachments, setAttachments] = useState<VisualAttachment[]>([]);
  const [isSketchOpen, setIsSketchOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

  // Today's allowance, shown next to the build button. Discovering the limit as a
  // 429 after typing out an idea is the worst possible moment to learn about it.
  const [quota, setQuota] = useState<{ used: number; limit: number | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getQuota()
      .then((result) => {
        if (!cancelled) setQuota(result.submissions);
      })
      .catch(() => {
        // Signed out or unreachable — the line simply doesn't render.
      });
    return () => {
      cancelled = true;
    };
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
      // Safari on iOS can take a while to produce a final result. Showing its interim
      // transcription makes the control responsive while the person is still speaking.
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
      // Do not wait for Safari's onstart callback: it may only arrive after the native
      // permission sheet closes, which otherwise makes the page appear unresponsive.
      setIsListening(true);
      recognition.start();
    } catch (err: unknown) {
      setIsListening(false);
      setMicNotice(err instanceof Error ? err.message : 'Voice recognition error');
    }
  };

  const matchedGame = useMemo(() => findMatchingGame(promptText, catalogEntries), [promptText, catalogEntries]);

  const handleFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
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
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleSaveSketch = (dataUrl: string) => {
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
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePrimarySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptText.trim();
    if (!trimmed && attachments.length === 0) return;

    let finalPrompt = trimmed;
    if (attachments.length > 0) {
      const attachSummary = attachments.map((a) => a.name).join(', ');
      finalPrompt = trimmed
        ? `${trimmed}\n\n[Visual attachments: ${attachSummary}]`
        : `Game idea with attached visuals: ${attachSummary}`;
    }

    // Recorded here rather than in the handler: this is the visitor asking for a game,
    // which happens whether or not they turn out to be signed in.
    recordCreateStep('spec_submitted');
    // No title is invented here any more. This used to send the prompt's first 40
    // characters as the game's name, and that string went on to be the name — in the
    // studio, in the catalog, in the agent's brief. Naming happens in the confirm step,
    // where the creator can see it and change it.
    onSubmitSpec(finalPrompt);
  };

  return (
    <section className="hero-prompt-section">
      {/* No mascot here: the header already shows him a few pixels above, and a second
          copy on its own row pushed the headline — the actual thesis — below the fold
          on a phone. He still carries the loading, empty, error and 404 moments. */}
      <div className="hero-text-container">
        <h1 className="hero-headline">{t('hero.mainTitle')}</h1>
      </div>

      <div
        className={`hero-prompt-card ${isDragging ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <form onSubmit={handlePrimarySubmit} className="prompt-box-form">
          <div className="prompt-composer-bar">
            <div className="prompt-attach" ref={attachMenuRef}>
              <button
                type="button"
                className={`prompt-icon-btn attach-btn${attachMenuOpen ? ' is-open' : ''}`}
                onClick={() => setAttachMenuOpen((open) => !open)}
                title={t('hero.attachMenuAria')}
                aria-label={t('hero.attachMenuAria')}
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
              >
                <PixelIcon name="plus" size={18} />
              </button>
              {attachMenuOpen ? (
                <div className="prompt-attach-menu" role="menu" aria-label={t('hero.attachMenu')}>
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

            <textarea
              className="big-prompt-input"
              autoFocus={shouldAutoFocusPrompt}
              value={promptText}
              onChange={(e) => {
                // Intent, recorded once per visit: the top of the creation funnel is
                // "someone started writing an idea", not "someone loaded the page".
                if (e.target.value.trim()) recordCreateStep('prompt_started');
                setPromptText(e.target.value);
                // Grow with the text on browsers that lack `field-sizing: content`.
                const el = e.target;
                el.style.height = '24px';
                if (el.value) {
                  el.style.height = `${Math.min(el.scrollHeight, 7.5 * 16)}px`;
                }
              }}
              placeholder={t('hero.bigPromptPlaceholder')}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handlePrimarySubmit(e);
                }
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
              >
                <PixelIcon name="mic" size={18} />
              </button>
            </div>

            <button
              type="submit"
              className="primary-btn build-btn"
              title={
                submissionStatus === 'refining'
                  ? t('qa.analyzing')
                  : submissionStatus === 'loading' || mockStatus === 'loading'
                    ? t('submit.submitting')
                    : t('hero.buildGameButton')
              }
              aria-label={
                submissionStatus === 'refining'
                  ? t('qa.analyzing')
                  : submissionStatus === 'loading' || mockStatus === 'loading'
                    ? t('submit.submitting')
                    : t('hero.buildGameButton')
              }
              disabled={
                submissionStatus !== 'idle' ||
                mockStatus === 'loading' ||
                (!promptText.trim() && attachments.length === 0)
              }
            >
              <PixelIcon name="rocket" size={16} />
              {/* Three states, not two: the refiner runs for a few seconds before
                  anything is submitted, and saying "Submitting…" through it was the
                  creator's first impression of a feature that had just started
                  working at all. Visually clipped on desktop (circular send);
                  shown on the phone's full-width row. */}
              <span className="build-btn-label">
                {submissionStatus === 'refining'
                  ? t('qa.analyzing')
                  : submissionStatus === 'loading' || mockStatus === 'loading'
                    ? t('submit.submitting')
                    : t('hero.buildGameButton')}
              </span>
            </button>
          </div>

          {(micNotice || isListening) && (
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
              <div className="matched-info">
                <span className="smart-badge">
                  <PixelIcon name="gamepad" size={14} /> {t('catalog.genre')}: {matchedGame.genre}
                </span>
                <h3 className="matched-title">{matchedGame.title}</h3>
                <p className="matched-desc">
                  {t('catalog.controls')}: {matchedGame.controls}
                </p>
              </div>
              <div className="matched-actions">
                <button type="button" className="primary-btn play-match-btn" onClick={() => onPlayGame?.(matchedGame)}>
                  <PixelIcon name="play" size={14} /> {t('hero.smartPlayBtn', { title: matchedGame.title })}
                </button>
              </div>
            </div>
          )}

          {!matchedGame && promptText.trim().length >= 3 && (
            <div className="smart-intent-card creation-card">
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
        {mockError && <p className="error">{mockError}</p>}

        {/* AI Act art. 50(1): a person interacting with an AI system has to be told so.
            This is the point of interaction — the box they type their idea into — and
            it doubles as the notice that what they write goes to AI models, which the
            privacy policy explains in full. */}
        <p className="ai-notice">
          <PixelIcon name="sparkle" size={12} /> {t('ai.creatorNotice')} <a href="/privacy">{t('legal.privacy')}</a>
        </p>

        <SketchModal isOpen={isSketchOpen} onClose={() => setIsSketchOpen(false)} onSaveSketch={handleSaveSketch} />
      </div>
    </section>
  );
}
