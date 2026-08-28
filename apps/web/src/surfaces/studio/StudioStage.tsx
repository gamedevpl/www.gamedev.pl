import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from '../../GameFrame.js';
import {
  useCreatorPlaytest,
  useGamePlayer,
  postGameHostMessage,
  requestStateSnapshot,
  requestStateRestore,
  type PlaytestInstrumentation,
} from '../../gamePlayer.js';
import { useEditorDraftBridge, type EditorContentPush, type EditorControllerState } from '../../editorBridge.js';
import { PixelIcon } from '../../PixelIcon.js';
import { submitFeedback, type FeedbackContext, type SubmissionApiError } from '../../submissionApi.js';
import { submitImprovement } from '../../studioApi.js';
import type { StageOrigin, StageSource } from '../../useStageSource.js';

/**
 * The stage: always mounted, always full-bleed, running the game whether or not the
 * creator asked to see it. This is the "game-first" inversion's core claim — every
 * other Studio surface (chat rail, Details, Edit, the shelf) is a layer *over* a stage
 * that keeps running, never a replacement for it. See
 * docs/studio-game-first-implementation-plan.md Workstream A + the ground-state rule.
 */

export type StagePosture = 'watch' | 'play';

/**
 * What the stage is showing, for the strip/ribbon to read. `crashed` and `drew-nothing`
 * are detected here (the bridge's own uncaught-error report, already shipped for Remix —
 * see gamePlayer.ts job 7 — needs no new bridge message) and surfaced so the ribbon can
 * name the worst exception without re-deriving it.
 */
export type StageStatus =
  { kind: 'empty' } | { kind: 'ready' } | { kind: 'crashed'; message: string } | { kind: 'drew-nothing' };

/** How long to watch a freshly-swapped document for an uncaught error (RemixPanel parity). */
const SWAP_WATCH_MS = 6_000;
/** The bridge posts `{type:'alive', frames}` every 5s; wait one tick past that. */
const DREW_NOTHING_CHECK_MS = 5_500;
/** Cheap battery honesty for a tab left open overnight. */
const IDLE_THROTTLE_MS = 10 * 60 * 1000;
// Idle window before a held swap auto-applies.
const INPUT_IDLE_MS = 400;
// Spaced retries for a frame whose harness hasn't mounted yet.
const STATE_RESTORE_RETRY_DELAYS_MS = [150, 350, 600];

function toContext(
  pngBase64: string | null | undefined,
  instrumentation: PlaytestInstrumentation,
): FeedbackContext | undefined {
  const hasShot = Boolean(pngBase64);
  const hasSignals =
    instrumentation.playSeconds > 0 ||
    instrumentation.lastAliveFrames != null ||
    instrumentation.errors.length > 0 ||
    instrumentation.progress.length > 0;
  if (!hasShot && !hasSignals) return undefined;
  return {
    ...(pngBase64 ? { screenshotPng: pngBase64 } : {}),
    instrumentation: {
      playSeconds: instrumentation.playSeconds,
      lastAliveFrames: instrumentation.lastAliveFrames,
      errors: instrumentation.errors,
      progress: instrumentation.progress,
    },
  };
}

export type StudioStageProps = {
  token: string;
  title: string;
  slug?: string;
  editable?: boolean;
  /** This job is a published catalog game — routes notes as an improvement, not feedback. */
  published: boolean;
  source: StageSource;
  posture: StagePosture;
  onPostureChange: (posture: StagePosture) => void;
  /** True whenever a surface (rail/details/edit/shelf) covers the stage. */
  covered: boolean;
  onStatusChange?: (status: StageStatus) => void;
  onFixIt?: (message: string) => void;
  /** A staged swap is being held for the ribbon's "newer stage waiting" exception. */
  onNewerStageWaiting?: (waiting: boolean) => void;
  /** A published-game improvement opened a new job; the parent moves the thread onto it. */
  onImproved?: (token: string) => void;
  /** The origin of whatever `source` is *actually shown* right now — distinct from
   * `source.origin` while a swap is held during play. The ribbon must describe the
   * document on screen, not the one waiting in the wings. */
  onDisplayedOriginChange?: (origin: StageOrigin) => void;
  /** Filled in with the editor bridge's live-push function, for the Code surface (§E tier 1). */
  editorPushRef?: MutableRefObject<EditorContentPush | null>;
  onEditorControllerChange?: (controller: EditorControllerState | null) => void;
  // Relayed iframe activity, for mobile chrome auto-hide.
  onPlayActivity?: () => void;
};

export function StudioStage({
  token,
  title,
  slug,
  editable,
  published,
  source,
  posture,
  onPostureChange,
  covered,
  onStatusChange,
  onFixIt,
  onNewerStageWaiting,
  onImproved,
  onDisplayedOriginChange,
  editorPushRef,
  onEditorControllerChange,
  onPlayActivity,
}: StudioStageProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // The document actually rendered. Distinct from `source.rawHtml`: while playing, a
  // new stage never replaces this mid-run (A4's swap policy) — it waits in
  // `pendingHtml`. Uses the pre-embed document — this component is the one that passes
  // `embed` to `GameFrame`, so feeding it `source.html` (already embedded) would inject
  // the player bridge twice.
  const [shownHtml, setShownHtml] = useState<string | null>(source.rawHtml);
  // What's actually on screen, for the ribbon — distinct from `source.origin` while a
  // swap is held during play (Codex review of PR #739: the ribbon must not claim the
  // held/pending build's provenance for a document that hasn't been applied yet).
  const [shownOrigin, setShownOrigin] = useState<StageOrigin>(source.origin);
  const [pendingHtml, setPendingHtml] = useState<string | null>(null);
  const [pendingOrigin, setPendingOrigin] = useState<StageOrigin | null>(null);
  const [shimmer, setShimmer] = useState(false);
  // Last player input — a ref, so tracking it never re-renders.
  const lastInputAtRef = useRef(0);
  // True while a pointer or touch is held down.
  const pointerHeldRef = useRef(false);
  const inputIdleTimerRef = useRef<number | null>(null);
  // Bumped by every applySwap, to detect a swap superseded mid-flight.
  const swapGenerationRef = useRef(0);
  const lastGoodRef = useRef<string | null>(source.rawHtml);
  const lastGoodOriginRef = useRef<StageOrigin>(source.origin);
  const lastGoodAtRef = useRef<number | null>(source.origin.at);

  const [status, setStatus] = useState<StageStatus>(source.rawHtml ? { kind: 'ready' } : { kind: 'empty' });
  const setStatusAndReport = useCallback(
    (next: StageStatus) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const [idle, setIdle] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const shimmerTimeoutRef = useRef<number | null>(null);
  const swapWatchRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (shimmerTimeoutRef.current !== null) {
        window.clearTimeout(shimmerTimeoutRef.current);
      }
    };
  }, []);

  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reacts only to a new source, not a bare posture change.
  useEffect(() => {
    const next = source.rawHtml;
    if (next === shownHtml) return;
    const inputActive = pointerHeldRef.current || Date.now() - lastInputAtRef.current < INPUT_IDLE_MS;
    if (posture === 'play' && shownHtml !== null && inputActive) {
      setPendingHtml(next);
      setPendingOrigin(source.origin);
      return;
    }
    applySwap(next, source.origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.rawHtml]);

  // Applies a held swap once input idles, or on leaving play.
  useEffect(() => {
    if (pendingHtml === null) return;
    if (posture !== 'play') {
      applySwap(pendingHtml, pendingOrigin ?? source.origin);
      setPendingHtml(null);
      setPendingOrigin(null);
      return undefined;
    }
    let cancelled = false;
    const tryApply = () => {
      if (cancelled) return;
      const idleFor = Date.now() - lastInputAtRef.current;
      if (idleFor >= INPUT_IDLE_MS && !pointerHeldRef.current) {
        void applySwapPreservingState(pendingHtml, pendingOrigin ?? source.origin);
        setPendingHtml(null);
        setPendingOrigin(null);
        return;
      }
      const wait = idleFor >= INPUT_IDLE_MS ? INPUT_IDLE_MS : INPUT_IDLE_MS - idleFor;
      inputIdleTimerRef.current = window.setTimeout(tryApply, wait);
    };
    tryApply();
    return () => {
      cancelled = true;
      if (inputIdleTimerRef.current !== null) window.clearTimeout(inputIdleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHtml, posture]);

  useEffect(() => {
    onDisplayedOriginChange?.(shownOrigin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownOrigin]);

  function applySwap(next: string | null, origin: StageOrigin) {
    swapGenerationRef.current += 1;
    swapWatchRef.current?.stop();
    const showShimmer = !reducedMotion && next != null && shownHtml != null;
    setShimmer(showShimmer);
    setShownHtml(next);
    setShownOrigin(origin);
    setStatusAndReport(next ? { kind: 'ready' } : { kind: 'empty' });
    if (next) watchSwappedDocument(next, origin);
    if (showShimmer) {
      if (shimmerTimeoutRef.current !== null) {
        window.clearTimeout(shimmerTimeoutRef.current);
      }
      shimmerTimeoutRef.current = window.setTimeout(() => {
        setShimmer(false);
        shimmerTimeoutRef.current = null;
      }, 400);
    }
  }

  // Snapshots, swaps, then retries restoring — a no-op without .persist().
  async function applySwapPreservingState(next: string, origin: StageOrigin) {
    const generation = swapGenerationRef.current;
    const snapshot = await requestStateSnapshot(frameRef.current);
    // A newer swap already landed while snapshotting — this one is stale.
    if (swapGenerationRef.current !== generation) return;
    applySwap(next, origin);
    if (snapshot === null) return;
    const myGeneration = swapGenerationRef.current;
    for (const delay of STATE_RESTORE_RETRY_DELAYS_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      if (swapGenerationRef.current !== myGeneration) return;
      if (await requestStateRestore(frameRef.current, snapshot)) return;
    }
  }

  /**
   * Listen for the freshly-swapped document to throw, and separately for "nothing
   * painted." The error path is exactly what RemixPanel already ships for the public
   * Remix code lane (SWAP_WATCH_MS, the same constant) — no new bridge message, no
   * assembler change, no sandbox change.
   *
   * `candidate` is only promoted to `lastGoodRef` once the full watch window elapses
   * with no crash reported *and* the document actually painted a frame — marking it
   * good the instant it's shown would let a crash, or a build that silently draws
   * nothing, "restore" the same broken document on the next recovery.
   */
  function watchSwappedDocument(candidate: string, origin: StageOrigin) {
    let sawFrame = false;
    function onMessage(event: MessageEvent) {
      if (event.origin !== 'null') return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; message?: string; frames?: number } | null;
      if (data?.source !== 'gdpl-player') return;
      if (data.type === 'error') {
        reportCrash(String(data.message ?? '').slice(0, 200));
        stop();
        return;
      }
      if (data.type === 'alive') {
        sawFrame = Number(data.frames ?? 0) > 0;
      }
    }
    function stop() {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(errorTimer);
      window.clearTimeout(drewNothingTimer);
      if (swapWatchRef.current?.stop === stop) swapWatchRef.current = null;
    }
    const errorTimer = window.setTimeout(() => {
      if (sawFrame) {
        lastGoodRef.current = candidate;
        lastGoodOriginRef.current = origin;
        lastGoodAtRef.current = origin.at ?? Date.now();
      }
      stop();
    }, SWAP_WATCH_MS);
    const drewNothingTimer = window.setTimeout(() => {
      if (!sawFrame) setStatusAndReport({ kind: 'drew-nothing' });
    }, DREW_NOTHING_CHECK_MS);
    swapWatchRef.current = { stop };
    window.addEventListener('message', onMessage);
  }

  // Timers/listener installed above must not outlive the component — a candidate that
  // never gets to finish its watch window (e.g. the creator navigates away) must not
  // call setState after unmount.
  useEffect(() => () => swapWatchRef.current?.stop(), []);

  function reportCrash(message: string) {
    if (posture === 'play') {
      // The creator's run just vanished under them — restore instantly and say so via
      // status; a card in the middle of a play session has nowhere honest to sit.
      const good = lastGoodRef.current;
      setShownHtml(good);
      setShownOrigin(lastGoodOriginRef.current);
      setStatusAndReport(good ? { kind: 'crashed', message } : { kind: 'empty' });
      return;
    }
    // Watch posture: the crash stays on screen. Seeing a build compile and then die is
    // the entire reason this layout exists, and it is the only sensor the platform has
    // for it — auto-reverting would hide the signal from the creator and the agent both.
    setStatusAndReport({ kind: 'crashed', message });
  }

  function recoverToLastGood() {
    const good = lastGoodRef.current;
    swapWatchRef.current?.stop();
    setShownHtml(good);
    setShownOrigin(lastGoodOriginRef.current);
    setStatusAndReport(good ? { kind: 'ready' } : { kind: 'empty' });
  }

  useEffect(() => {
    onNewerStageWaiting?.(pendingHtml !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHtml]);

  // Idle throttle (A5): 10 minutes with no swap and no activity while watching.
  const resetIdle = useCallback(() => {
    setIdle(false);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (posture !== 'watch') return;
    idleTimerRef.current = window.setTimeout(() => {
      setIdle(true);
      postGameHostMessage(frameRef.current, { type: 'pause' });
    }, IDLE_THROTTLE_MS);
  }, [posture]);

  useEffect(() => {
    resetIdle();
    if (posture !== 'watch') return;
    const onActivity = () => resetIdle();
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [posture, resetIdle, shownHtml]);

  function resumeFromIdle() {
    setIdle(false);
    postGameHostMessage(frameRef.current, { type: 'resume' });
    resetIdle();
  }

  // Entering play must undo both of watch posture's standing effects: the idle
  // throttle's `pause` (posture-change alone only clears the *overlay*, per
  // `resetIdle` above — the frame stays paused until told otherwise) and the mute
  // below. Idempotent on the bridge either way, so this is safe to send unconditionally.
  useEffect(() => {
    if (posture !== 'play') return;
    postGameHostMessage(frameRef.current, { type: 'resume' });
  }, [posture]);

  // Watch posture: muted, frozen when hidden — the three constraints StudioLivePreview
  // used to own, now permanent properties of the stage itself. Play posture: audible —
  // a game only ever watched, never played, must not stay silent forever.
  useEffect(() => {
    if (!shownHtml) return;
    const muted = posture === 'watch';
    for (let attempt = 0; attempt < 4; attempt++) {
      window.setTimeout(() => postGameHostMessage(frameRef.current, { type: 'setSound', muted }), attempt * 250);
    }
  }, [posture, shownHtml]);

  useEffect(() => {
    if (posture !== 'watch') return;
    const onVisibility = () => {
      postGameHostMessage(frameRef.current, { type: document.visibilityState === 'hidden' ? 'pause' : 'resume' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [posture]);

  // Play posture: absorbed from StudioPlaytestPanel's theater internals.
  const active = posture === 'play' && Boolean(shownHtml);
  const { paused, snapshot, instrumentation, pause, resume, clearSnapshot } = useCreatorPlaytest(frameRef, active);
  const requestWatch = useCallback(() => onPostureChange('watch'), [onPostureChange]);
  const onGameActivity = useCallback(() => {
    lastInputAtRef.current = Date.now();
    onPlayActivity?.();
  }, [onPlayActivity]);
  const onPointerHeldChange = useCallback((held: boolean) => {
    pointerHeldRef.current = held;
    // A release restarts the idle countdown from now.
    if (!held) lastInputAtRef.current = Date.now();
  }, []);
  useGamePlayer(frameRef, active, requestWatch, undefined, onGameActivity, undefined, onPointerHeldChange);
  const editorBridgeActive = Boolean(shownHtml) && Boolean(editable) && (posture === 'play' || covered);
  const editorBridge = useEditorDraftBridge(frameRef, editorBridgeActive, slug, Boolean(editable));
  useEffect(() => {
    if (!editorPushRef) return undefined;
    editorPushRef.current = editorBridge.push;
    return () => {
      if (editorPushRef.current === editorBridge.push) editorPushRef.current = null;
    };
  }, [editorPushRef, editorBridge.push]);
  useEffect(() => {
    onEditorControllerChange?.(editorBridge.controller);
    return () => onEditorControllerChange?.(null);
  }, [editorBridge.controller, onEditorControllerChange]);

  // Escape closes the topmost layer first (Workstream C's ground-state rule test):
  // while a surface covers the stage (shelf, Details, Edit), that surface owns Escape
  // and this must stay quiet — only an *uncovered* play posture is the topmost layer.
  useEffect(() => {
    if (posture !== 'play' || covered) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestWatch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [posture, covered, requestWatch]);

  const [noteText, setNoteText] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const promptOpen = posture === 'play' && Boolean(paused || snapshot);
  const attachedPng = snapshot?.pngBase64 ?? null;
  const trimmedNote = noteText.trim();

  async function sendNote() {
    if (trimmedNote.length < 10) return;
    setSendState('sending');
    setSendError(null);
    const context = toContext(attachedPng, snapshot?.instrumentation ?? instrumentation);
    try {
      if (published) {
        const result = await submitImprovement(token, trimmedNote, context);
        // No token means the agent replied instead of opening a round.
        if (result.token) onImproved?.(result.token);
      } else {
        await submitFeedback(token, trimmedNote, context);
      }
      setSendState('sent');
      setNoteText('');
      clearSnapshot();
      if (paused) resume();
    } catch (err) {
      const apiErr = err as SubmissionApiError;
      const message = err instanceof Error ? err.message : '';
      setSendError(
        message === 'content_rejected'
          ? t('errors.contentRejected.other')
          : apiErr.status === 429 || message.includes('too many')
            ? t('studioPanel.improve.rateLimit')
            : t('studioPanel.improve.error'),
      );
      setSendState('idle');
    }
  }

  const stageClasses = [
    'studio-stage',
    `is-${posture}`,
    covered ? 'is-covered' : '',
    idle ? 'is-idle' : '',
    shimmer ? 'is-shimmering' : '',
    status.kind === 'crashed' || status.kind === 'drew-nothing' ? 'is-dead' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={stageClasses}>
      {shownHtml ? (
        <div className="studio-stage-frame">
          <GameFrame frameRef={frameRef} title={title} html={shownHtml} embed autoFocus={posture === 'play'} />
        </div>
      ) : (
        <div className="studio-stage-void" aria-hidden="true" />
      )}

      {idle ? (
        <button type="button" className="studio-stage-idle-poster" onClick={resumeFromIdle}>
          <PixelIcon name="play" size={16} />
          <span>{t('studioPanel.stage.idleResume')}</span>
        </button>
      ) : null}

      {status.kind === 'crashed' || status.kind === 'drew-nothing' ? (
        <div className="studio-stage-card is-crashed" role="alert">
          <p className="studio-stage-card-title">
            {status.kind === 'crashed' ? t('studioPanel.stage.crashedTitle') : t('studioPanel.stage.drewNothingTitle')}
          </p>
          {status.kind === 'crashed' ? <code className="studio-stage-card-detail">{status.message}</code> : null}
          <div className="studio-stage-card-actions">
            {status.kind === 'crashed' && onFixIt ? (
              <button type="button" className="primary-btn" onClick={() => onFixIt(status.message)}>
                <PixelIcon name="wrench" size={12} /> {t('studioPanel.stage.fixIt')}
              </button>
            ) : null}
            <button
              type="button"
              className={status.kind === 'crashed' && onFixIt ? 'secondary-btn' : 'primary-btn'}
              onClick={recoverToLastGood}
              disabled={!lastGoodRef.current}
            >
              <PixelIcon name="undo" size={12} />{' '}
              {t('studioPanel.stage.backTo', { time: formatClock(lastGoodAtRef.current ?? Date.now()) })}
            </button>
          </div>
        </div>
      ) : null}

      {posture === 'play' && shownHtml ? (
        <div className="studio-stage-play-bar">
          {paused ? (
            <button type="button" className="secondary-btn" onClick={resume}>
              <PixelIcon name="play" size={12} /> <span className="btn-label">{t('studioPanel.playtest.resume')}</span>
            </button>
          ) : (
            <button type="button" className="primary-btn" onClick={pause}>
              <PixelIcon name="pause" size={12} /> <span className="btn-label">{t('studioPanel.playtest.pause')}</span>
            </button>
          )}
          <button type="button" className="secondary-btn" onClick={requestWatch}>
            <PixelIcon name="close" size={12} /> <span className="btn-label">{t('studioPanel.stage.stopPlaying')}</span>
          </button>
        </div>
      ) : null}

      {promptOpen ? (
        <div className="studio-stage-sheet status-feedback">
          <h3 className="status-feedback-title">{t('studioPanel.playtest.promptTitle')}</h3>
          <p className="status-feedback-hint">{t('studioPanel.playtest.promptHint')}</p>
          {attachedPng ? (
            <figure className="studio-playtest-shot">
              <img src={`data:image/png;base64,${attachedPng}`} alt="" />
            </figure>
          ) : null}
          <textarea
            className="status-feedback-input"
            value={noteText}
            onChange={(event) => {
              setNoteText(event.target.value);
              if (sendState === 'sent') setSendState('idle');
            }}
            placeholder={t('studioPanel.playtest.placeholder')}
            rows={3}
            maxLength={2000}
          />
          <div className="status-feedback-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={() => void sendNote()}
              disabled={sendState === 'sending' || trimmedNote.length < 10}
            >
              {sendState === 'sending' ? t('studioPanel.improve.sending') : t('studioPanel.playtest.submit')}
            </button>
            {sendState === 'sent' ? (
              <span className="status-feedback-sent">
                <PixelIcon name="check" size={13} /> {t('studioPanel.improve.sent')}
              </span>
            ) : null}
          </div>
          {sendError ? <p className="error">{sendError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
