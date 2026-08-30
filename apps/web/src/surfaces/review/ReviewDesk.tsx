import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './review.css';
import { useAuth } from '../../AuthContext.js';
import { catalogMediaUrl, defaultScreenshotIndex } from '../../catalog.js';
import { GameTheater } from '../../GameTheater.js';
import {
  ASSESSMENT_CHECKLIST_KEYS,
  ASSESSMENT_CHECKLIST_MARKS,
  emptyAssessmentChecklist,
  isChecklistComplete,
} from './reviewChecklist.js';
import { captureReviewClientContext } from './reviewClientContext.js';
import { fetchReviewQueue, ReviewApiError, submitAssessment, type ReviewQueueItem } from './reviewApi.js';
import type {
  AssessmentChecklist,
  AssessmentChecklistKey,
  AssessmentChecklistMark,
  AssessmentNoteOrigin,
  AssessmentVerdict,
} from './reviewTypes.js';

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

function hasPreviewMedia(item: ReviewQueueItem): boolean {
  return Boolean(item.media?.video || (item.media?.screenshots.length ?? 0) > 0);
}

export function ReviewDesk() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [source, setSource] = useState<SourceFilter>('all');
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [assessed, setAssessed] = useState(0);
  const [emptyReason, setEmptyReason] = useState<'no_active_sweep' | 'sweep_paused' | 'queue_clear' | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [note, setNote] = useState('');
  const [noteOrigin, setNoteOrigin] = useState<AssessmentNoteOrigin>('none');
  const [checklist, setChecklist] = useState<Partial<AssessmentChecklist>>(() => emptyAssessmentChecklist());
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<AssessmentVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [shotIndex, setShotIndex] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechBaseRef = useRef('');
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragXRef = useRef(0);
  const dragYRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const current = items[0] ?? null;
  const screenshots = current?.media?.screenshots ?? [];
  const selectedShot = screenshots[shotIndex] ?? screenshots[0] ?? null;
  const videoFile = current?.media?.video ?? null;
  const posterUrl = current && selectedShot ? catalogMediaUrl(current.slug, selectedShot.file, 640) : undefined;
  const videoUrl = current && videoFile ? catalogMediaUrl(current.slug, videoFile) : null;

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
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
        setEmptyReason(queue.emptyReason ?? (queue.items.length === 0 ? 'queue_clear' : null));
        setState(queue.items.length === 0 ? 'empty' : 'ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = err instanceof ReviewApiError ? err.status : 0;
        setState(status === 404 || status === 401 ? 'denied' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.reviewer, source]);

  // Open theater when preview media is missing.
  useEffect(() => {
    if (!current) return;
    setPlaying(!hasPreviewMedia(current));
    setShotIndex(defaultScreenshotIndex(current.media?.screenshots ?? []));
    setDragX(0);
    setDragY(0);
    dragXRef.current = 0;
    dragYRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slug only
  }, [current?.slug]);

  useEffect(() => {
    if (!playing) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [playing]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing || !videoUrl) {
      video.pause();
      return;
    }
    void Promise.resolve(video.play()).then(
      () => undefined,
      () => undefined,
    );
  }, [videoUrl, playing, current?.slug]);

  const resetForm = () => {
    setNote('');
    setNoteOrigin('none');
    setChecklist(emptyAssessmentChecklist());
    setMicNotice(null);
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const formReady = note.trim().length > 0 && isChecklistComplete(checklist);

  const commit = async (verdict: AssessmentVerdict) => {
    if (!current || busy) return;
    if (!note.trim() || !isChecklistComplete(checklist)) {
      setError(t('review.formIncomplete'));
      return;
    }
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
        note: note.trim(),
        noteOrigin: noteOrigin === 'speech' ? 'speech' : 'text',
        checklist,
        clientContext: captureReviewClientContext(),
      });
      setItems((prev) => prev.slice(1));
      setAssessed((n) => n + 1);
      resetForm();
      setDragX(0);
      setDragY(0);
      dragXRef.current = 0;
      dragYRef.current = 0;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('review.error'));
    } finally {
      setBusy(false);
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = window.setTimeout(() => {
        flashTimerRef.current = null;
        setFlash(null);
      }, 280);
    }
  };

  const setChecklistMark = (key: AssessmentChecklistKey, mark: AssessmentChecklistMark) => {
    setChecklist((prev) => ({ ...prev, [key]: mark }));
    setError(null);
  };

  const commitRef = useRef(commit);
  commitRef.current = commit;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => {
      if (busyRef.current) return;
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void commitRef.current('keep');
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void commitRef.current('cut');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        void commitRef.current('skip');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slug gate
  }, [current?.slug]);

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
    if (busy || !current || playing) return;
    // Don't steal pointer from controls / media chrome.
    if ((event.target as HTMLElement).closest('textarea, button, a, input, video, img')) return;
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

  if (state === 'error') {
    return (
      <section className="review-desk">
        <p className="review-desk-status" role="alert">
          {t('review.loadError')}
        </p>
      </section>
    );
  }

  const tilt = Math.max(-18, Math.min(18, dragX / 12));
  const keepHint = dragX > 40;
  const cutHint = dragX < -40;
  const skipHint = dragY > 40 && Math.abs(dragY) > Math.abs(dragX);
  const showMedia = Boolean(current && hasPreviewMedia(current));

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
          {emptyReason === 'no_active_sweep'
            ? t('review.emptyNoSweep')
            : emptyReason === 'sweep_paused'
              ? t('review.emptyPaused')
              : t('review.empty')}
        </p>
      ) : (
        <>
          <div className="review-scroll">
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
                {current.reReview ? (
                  <p className="review-card-rereview">
                    {t('review.reReviewBadge')}
                    {current.reReview.reason
                      ? ` — ${t('review.reReviewReason', { reason: current.reReview.reason })}`
                      : ''}
                  </p>
                ) : null}
              </div>

              <div className="review-card-stage">
                {showMedia ? (
                  <>
                    {videoUrl ? (
                      <video
                        ref={videoRef}
                        className="review-preview-video"
                        src={videoUrl}
                        poster={posterUrl}
                        muted
                        loop
                        playsInline
                        controls
                        preload="metadata"
                      />
                    ) : posterUrl ? (
                      <img
                        className="review-preview-still"
                        src={posterUrl}
                        alt={t('review.previewImage', { title: current.title })}
                        decoding="async"
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="review-preview-empty">
                    <p>{t('review.noMedia')}</p>
                  </div>
                )}
                <button type="button" className="review-play-btn is-overlay" onClick={() => setPlaying(true)}>
                  {t('review.tryPlay')}
                </button>
                {keepHint ? <div className="review-stamp is-keep">{t('review.keep')}</div> : null}
                {cutHint ? <div className="review-stamp is-cut">{t('review.cut')}</div> : null}
                {skipHint ? <div className="review-stamp is-skip">{t('review.skip')}</div> : null}
              </div>

              {showMedia && screenshots.length > 1 ? (
                <div className="review-shots" role="list" aria-label={t('review.shotsLabel')}>
                  {screenshots.map((shot, index) => (
                    <button
                      key={shot.file}
                      type="button"
                      role="listitem"
                      className={index === shotIndex ? 'review-shot is-active' : 'review-shot'}
                      aria-pressed={index === shotIndex}
                      aria-label={t('review.shotNamed', { name: shot.name })}
                      onClick={() => setShotIndex(index)}
                    >
                      <img src={catalogMediaUrl(current.slug, shot.file, 96)} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="review-dock">
            <fieldset className="review-checklist">
              <legend className="review-checklist-legend">{t('review.checklistLabel')}</legend>
              {ASSESSMENT_CHECKLIST_KEYS.map((key) => (
                <div key={key} className="review-checklist-row">
                  <span className="review-checklist-facet">{t(`review.checklist.${key}`)}</span>
                  <div className="review-checklist-marks" role="group" aria-label={t(`review.checklist.${key}`)}>
                    {ASSESSMENT_CHECKLIST_MARKS.map((mark) => (
                      <button
                        key={mark}
                        type="button"
                        className={
                          checklist[key] === mark
                            ? `review-checklist-mark is-${mark} is-active`
                            : `review-checklist-mark is-${mark}`
                        }
                        aria-pressed={checklist[key] === mark}
                        disabled={busy}
                        onClick={() => setChecklistMark(key, mark)}
                      >
                        {t(`review.checklistMark.${mark}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>

            <div className="review-note">
              <label className="review-note-label" htmlFor="review-note">
                {t('review.noteLabel')}
              </label>
              <div className="review-note-row">
                <textarea
                  id="review-note"
                  className="review-note-input"
                  rows={2}
                  required
                  value={note}
                  maxLength={2000}
                  placeholder={t('review.notePlaceholder')}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setError(null);
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
              <button
                type="button"
                className="review-action is-cut"
                disabled={busy || !formReady}
                onClick={() => void commit('cut')}
              >
                {t('review.cut')}
                <span className="review-action-hint">←</span>
              </button>
              <button
                type="button"
                className="review-action is-skip"
                disabled={busy || !formReady}
                onClick={() => void commit('skip')}
              >
                {t('review.skip')}
                <span className="review-action-hint">↓</span>
              </button>
              <button
                type="button"
                className="review-action is-keep"
                disabled={busy || !formReady}
                onClick={() => void commit('keep')}
              >
                {t('review.keep')}
                <span className="review-action-hint">→</span>
              </button>
            </div>
          </div>
        </>
      )}

      {error ? (
        <p className="review-error" role="alert">
          {error}
        </p>
      ) : null}

      {playing && current ? (
        <GameTheater
          key={current.slug}
          title={current.title}
          badge={{ icon: 'star', label: t('review.tryPlay') }}
          source={{ slug: current.slug }}
          onExit={() => setPlaying(false)}
          trackPlay={false}
          remixable={false}
          submittedBy={current.creatorHandle}
          creatorHandle={current.creatorHandle}
        />
      ) : null}
    </section>
  );
}
