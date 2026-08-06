import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { PublishedGameFrame } from './PublishedGameFrame.js';
import { fetchReviewQueue, submitAssessment, type ReviewQueueItem } from './reviewApi.js';
import type { AssessmentNoteOrigin, AssessmentVerdict } from './reviewTypes.js';

/**
 * Reviewer swipe desk (docs/game-assessment-plan.md).
 *
 * Unlisted `/review`. A trusted colleague walks catalog games and shared creator
 * drafts, swipes keep/cut, and leaves a short reason — typed or spoken via the
 * same Web Speech API as the hero mic. Deliberately untranslated chrome for the
 * operator console's neighbor would be wrong here: reviewers may be Polish-
 * speaking colleagues, so the strings go through i18n.
 */

interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionResultItem;
  isFinal?: boolean;
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

function speechRecognitionClass(): (new () => SpeechRecognitionInstance) | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

type SourceFilter = 'all' | 'catalog' | 'creator';
type LoadState = 'loading' | 'ready' | 'empty' | 'denied' | 'error';

const SWIPE_THRESHOLD_PX = 80;

export function ReviewDesk() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [source, setSource] = useState<SourceFilter>('all');
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [assessed, setAssessed] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [note, setNote] = useState('');
  const [noteOrigin, setNoteOrigin] = useState<AssessmentNoteOrigin>('none');
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<AssessmentVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechBaseRef = useRef('');
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragXRef = useRef(0);
  const dragYRef = useRef(0);

  const current = items[0] ?? null;

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.reviewer) {
      setState('denied');
      return;
    }

    let cancelled = false;
    setState('loading');
    setError(null);
    void fetchReviewQueue(source)
      .then((queue) => {
        if (cancelled) return;
        setItems(queue.items);
        setAssessed(queue.assessed);
        setState(queue.items.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (cancelled) return;
        // 404 from a stale client hint, or a real failure — both look like "no desk".
        setState('denied');
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.reviewer, source]);

  useEffect(() => {
    if (!current || busy) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void commit('keep');
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void commit('cut');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        void commit('skip');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const resetNote = () => {
    setNote('');
    setNoteOrigin('none');
    setMicNotice(null);
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const commit = async (verdict: AssessmentVerdict) => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    setFlash(verdict);
    try {
      await submitAssessment({
        slug: current.slug,
        source: current.source,
        title: current.title,
        creatorHandle: current.creatorHandle,
        verdict,
        note: note.trim() || undefined,
        noteOrigin: note.trim() ? noteOrigin : 'none',
      });
      setItems((prev) => prev.slice(1));
      setAssessed((n) => n + 1);
      resetNote();
      setDragX(0);
      setDragY(0);
      dragXRef.current = 0;
      dragYRef.current = 0;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('review.error'));
    } finally {
      setBusy(false);
      window.setTimeout(() => setFlash(null), 280);
    }
  };

  const toggleMic = () => {
    setMicNotice(null);
    const SpeechClass = speechRecognitionClass();
    if (!SpeechClass) {
      setMicNotice(t('review.micUnsupported'));
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
      recognition.interimResults = true;
      recognition.lang = window.navigator.language || 'en-US';
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = Array.from(event.results ?? [])
          .map((result) => result[0]?.transcript ?? '')
          .join('')
          .trim();
        if (transcript) {
          setNote(speechBaseRef.current ? `${speechBaseRef.current} ${transcript}` : transcript);
          setNoteOrigin('speech');
        }
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        recognitionRef.current = null;
        setIsListening(false);
        if (event.error === 'not-allowed') setMicNotice(t('review.micDenied'));
        else if (event.error !== 'aborted' && event.error !== 'no-speech') {
          setMicNotice(t('review.micError', { error: event.error }));
        }
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };
      speechBaseRef.current = note.trim();
      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      setMicNotice(t('review.micUnsupported'));
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || !current) return;
    // Don't steal pointer from the note / buttons / iframe chrome.
    if ((event.target as HTMLElement).closest('textarea, button, a, input, iframe')) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    dragXRef.current = dx;
    dragYRef.current = dy;
    setDragX(dx);
    setDragY(dy);
  };

  const onPointerUp = () => {
    if (!pointerStart.current) return;
    pointerStart.current = null;
    const dx = dragXRef.current;
    const dy = dragYRef.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
      void commit(dx > 0 ? 'keep' : 'cut');
    } else if (dy >= SWIPE_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx)) {
      void commit('skip');
    } else {
      setDragX(0);
      setDragY(0);
      dragXRef.current = 0;
      dragYRef.current = 0;
    }
  };

  if (authLoading || state === 'loading') {
    return (
      <section className="review-desk" aria-busy="true">
        <p className="review-desk-status">{t('review.loading')}</p>
      </section>
    );
  }

  if (state === 'denied' || !user?.reviewer) {
    return (
      <section className="review-desk">
        <p className="review-desk-status" role="status">
          {t('review.denied')}
        </p>
      </section>
    );
  }

  const tilt = Math.max(-18, Math.min(18, dragX / 12));
  const keepHint = dragX > 40;
  const cutHint = dragX < -40;
  const skipHint = dragY > 40 && Math.abs(dragY) > Math.abs(dragX);

  return (
    <section className="review-desk">
      <header className="review-desk-header">
        <div>
          <h1 className="review-desk-title">{t('review.title')}</h1>
          <p className="review-desk-sub">{t('review.progress', { assessed, remaining: items.length })}</p>
        </div>
        <div className="review-desk-filters" role="group" aria-label={t('review.sourceLabel')}>
          {(['all', 'catalog', 'creator'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={source === value ? 'review-filter is-active' : 'review-filter'}
              aria-pressed={source === value}
              onClick={() => setSource(value)}
            >
              {t(`review.source.${value}`)}
            </button>
          ))}
        </div>
      </header>

      {state === 'empty' || !current ? (
        <p className="review-desk-status" role="status">
          {t('review.empty')}
        </p>
      ) : (
        <>
          <div
            className={`review-card${flash ? ` is-${flash}` : ''}`}
            style={{
              transform: `translate(${dragX}px, ${Math.max(0, dragY) * 0.4}px) rotate(${tilt}deg)`,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="review-card-meta">
              <h2 className="review-card-title">{current.title}</h2>
              <p className="review-card-byline">
                <span className="review-card-slug">{current.slug}</span>
                {current.creatorHandle ? <span> · @{current.creatorHandle}</span> : null}
                <span> · {t(`review.source.${current.source}`)}</span>
              </p>
            </div>

            <div className="review-card-stage">
              <PublishedGameFrame slug={current.slug} title={current.title} embed remixable={false} trackPlay={false} />
              {keepHint ? <div className="review-stamp is-keep">{t('review.keep')}</div> : null}
              {cutHint ? <div className="review-stamp is-cut">{t('review.cut')}</div> : null}
              {skipHint ? <div className="review-stamp is-skip">{t('review.skip')}</div> : null}
            </div>
          </div>

          <div className="review-note">
            <label className="review-note-label" htmlFor="review-note">
              {t('review.noteLabel')}
            </label>
            <div className="review-note-row">
              <textarea
                id="review-note"
                className="review-note-input"
                rows={2}
                value={note}
                maxLength={2000}
                placeholder={t('review.notePlaceholder')}
                onChange={(event) => {
                  setNote(event.target.value);
                  if (event.target.value.trim()) {
                    setNoteOrigin((prev) => (prev === 'speech' ? 'speech' : 'text'));
                  } else {
                    setNoteOrigin('none');
                  }
                }}
              />
              <button
                type="button"
                className={isListening ? 'review-mic is-live' : 'review-mic'}
                aria-pressed={isListening}
                aria-label={isListening ? t('review.micStop') : t('review.micStart')}
                onClick={toggleMic}
              >
                {isListening ? t('review.micStopShort') : t('review.micStartShort')}
              </button>
            </div>
            {micNotice ? (
              <p className="review-mic-notice" role="status">
                {micNotice}
              </p>
            ) : null}
          </div>

          <div className="review-actions" role="group" aria-label={t('review.actionsLabel')}>
            <button type="button" className="review-action is-cut" disabled={busy} onClick={() => void commit('cut')}>
              {t('review.cut')}
              <span className="review-action-hint">←</span>
            </button>
            <button type="button" className="review-action is-skip" disabled={busy} onClick={() => void commit('skip')}>
              {t('review.skip')}
              <span className="review-action-hint">↓</span>
            </button>
            <button type="button" className="review-action is-keep" disabled={busy} onClick={() => void commit('keep')}>
              {t('review.keep')}
              <span className="review-action-hint">→</span>
            </button>
          </div>
        </>
      )}

      {error ? (
        <p className="review-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
