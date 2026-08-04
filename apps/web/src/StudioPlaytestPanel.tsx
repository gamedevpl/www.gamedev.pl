import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPublishedGame } from './catalog.js';
import { GameFrame } from './GameFrame.js';
import { useCreatorPlaytest, useGamePlayer, type PlaytestInstrumentation } from './gamePlayer.js';
import { useEditorDraftBridge } from './editorBridge.js';
import { PixelIcon } from './PixelIcon.js';
import {
  getSubmissionPreview,
  getSubmissionStatus,
  submitFeedback,
  type FeedbackContext,
  type SubmissionApiError,
} from './submissionApi.js';
import { submitImprovement, type StudioGame } from './studioApi.js';

/**
 * Creator Studio playtest: play the draft/live build, pause on a moment worth
 * talking about, and send a change request with the paused frame + a small
 * instrumentation digest attached. The parent cannot screenshot the sandboxed
 * canvas (no allow-same-origin) — capture runs inside the player bridge.
 *
 * Always mounts as a full-viewport theater (same idea as GameTheater): the game
 * owns the screen; pause/resume + the note sheet are layers on top. An inset
 * 16:9 card inside Studio chrome is unplayable on a phone (iPhone SE especially).
 */

/** Tiny canvas toy used only when DEV_SEED_STUDIO left no real preview HTML. */
const DEV_PLAYTEST_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Studio playtest</title>
<style>html,body{margin:0;height:100%;background:#0b1018;overflow:hidden}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="game"></canvas>
<script>
(function(){
  var c=document.getElementById('game'),x=c.getContext('2d'),t=0;
  function resize(){c.width=innerWidth;c.height=innerHeight;}
  addEventListener('resize',resize);resize();
  (function loop(){
    t+=0.02;x.fillStyle='#0b1018';x.fillRect(0,0,c.width,c.height);
    for(var i=0;i<12;i++){
      var a=t+i*0.5,r=40+i*8;
      x.beginPath();
      x.arc(c.width/2+Math.cos(a)*r,c.height/2+Math.sin(a*1.3)*r,6,0,Math.PI*2);
      x.fillStyle='hsl('+(i*28+t*40)+' 70% 55%)';x.fill();
    }
    x.fillStyle='#9fe870';x.font='600 16px system-ui';x.fillText('Studio playtest demo',16,28);
    requestAnimationFrame(loop);
  })();
})();
</script></body></html>`;

/** How often to retry `/preview` while the gate is still assembling HTML (HTTP 409). */
export const PREVIEW_POLL_MS = 3000;
/** Give up waiting so a permanent 409 (gate red, no artifact) does not poll forever. */
export const PREVIEW_WAIT_MAX_MS = 10 * 60 * 1000;

type StudioPlaytestPanelProps = {
  game: StudioGame;
  published: boolean;
  /** Leave theater — typically returns to Overview so Studio chrome is usable again. */
  onExit: () => void;
  /** True when the games shelf drawer/rail is open above the playtest surface. */
  shelfOpen?: boolean;
};

/**
 * Studio playtest assumes landscape games — nudge when a handheld is upright.
 * Desktop windows can be any shape (owner resizes; don't tell them to rotate).
 * Mirrors GameTheater's coarse-pointer gate + Mascot's Safari MediaQueryList shim.
 */
function useNeedsLandscape(): boolean {
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches) {
      setNeeds(false);
      return;
    }
    const query = matchMedia('(orientation: landscape)');
    const sync = () => setNeeds(!query.matches);
    sync();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync);
      return () => query.removeEventListener('change', sync);
    }
    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  return needs;
}

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

export function StudioPlaytestPanel({ game, published, onExit, shelfOpen }: StudioPlaytestPanelProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const exitRef = useRef<HTMLButtonElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** True while `/preview` returns 409 — gate is still assembling the draft HTML. */
  const [waitingForPreview, setWaitingForPreview] = useState(false);
  const [text, setText] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const needsLandscape = useNeedsLandscape();

  const active = Boolean(html);
  const { paused, snapshot, instrumentation, pause, resume, clearSnapshot } = useCreatorPlaytest(frameRef, active);

  // Stable exit for Escape (window + iframe bridge) — same pattern as GameTheater.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const requestExit = useCallback(() => {
    if (shelfOpen) return;
    onExitRef.current();
  }, [shelfOpen]);
  // Escape inside the sandboxed game never reaches the parent — the bridge relays it.
  useGamePlayer(frameRef, active, requestExit);
  // An editable game asks for the creator's content draft over the bridge; this
  // answers it, so a saved draft plays here instantly. No-op for every other game.
  useEditorDraftBridge(frameRef, active, game.slug, Boolean(game.editable));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waitStartedAt = Date.now();
    setHtml(null);
    setLoadError(null);
    setWaitingForPreview(false);
    setLoading(true);
    clearSnapshot();

    const finishError = (message: string) => {
      if (cancelled) return;
      setWaitingForPreview(false);
      setLoadError(message);
      setLoading(false);
    };

    /**
     * 409 alone is ambiguous: gate still assembling, or gate already red with no
     * artifact. Status settles the latter — Play has unmounted the thread poller.
     */
    const previewStillComing = async (): Promise<boolean> => {
      if (Date.now() - waitStartedAt >= PREVIEW_WAIT_MAX_MS) return false;
      try {
        const job = await getSubmissionStatus(game.token);
        if (job.preview?.slug) return true;
        if (job.status === 'needs_changes' || job.status === 'abandoned') return false;
        if (job.failure) return false;
      } catch {
        // Status probe failed — keep waiting on the preview 409 itself.
      }
      return Date.now() - waitStartedAt < PREVIEW_WAIT_MAX_MS;
    };

    const loadOnce = async (): Promise<'done' | 'retry'> => {
      try {
        const documentHtml =
          published && game.slug
            ? (await fetchPublishedGame(game.slug)).html
            : (await getSubmissionPreview(game.token)).html;
        if (cancelled) return 'done';
        setHtml(documentHtml);
        setWaitingForPreview(false);
        setLoadError(null);
        setLoading(false);
        return 'done';
      } catch (err) {
        if (cancelled) return 'done';
        const status = (err as SubmissionApiError).status;
        // 409 = sources landed, gate still assembling preview.html. Keep waiting —
        // a one-shot error here is what made "Play" look broken right after submit.
        // Stop when the round is already terminal with no artifact (or we timed out).
        if (!published && status === 409 && (await previewStillComing())) {
          if (cancelled) return 'done';
          setWaitingForPreview(true);
          setLoadError(null);
          setLoading(true);
          return 'retry';
        }
        // Local Studio seed has submissions but no games-repo HTML. Fall back to a
        // tiny canvas toy in Vite so Pause & note can still be exercised offline.
        // Vitest runs with MODE=test — keep the real empty/error surface there.
        if (import.meta.env.MODE === 'development') {
          setHtml(DEV_PLAYTEST_HTML);
          setWaitingForPreview(false);
          setLoading(false);
          return 'done';
        }
        finishError(t('studioPanel.playtest.loadError'));
        return 'done';
      }
    };

    const tick = async () => {
      const outcome = await loadOnce();
      if (outcome === 'retry' && !cancelled) {
        timer = setTimeout(() => {
          void tick();
        }, PREVIEW_POLL_MS);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [game.token, game.slug, published, t, clearSnapshot]);

  // Escape always returns to the thread — including the empty/error state, where the
  // theater never mounts and the Close control used to be missing entirely.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !shelfOpen) requestExit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestExit, shelfOpen]);

  // Scroll lock + focus handoff while the theater owns the viewport.
  useEffect(() => {
    if (!html) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.classList.add('player-open');
    exitRef.current?.focus();

    return () => {
      document.body.classList.remove('player-open');
      previouslyFocused?.focus?.();
    };
  }, [html]);

  const attachedPng = snapshot?.pngBase64 ?? null;
  const trimmed = text.trim();
  const promptOpen = Boolean(paused || snapshot);

  const send = async () => {
    if (trimmed.length < 10) return;
    setSendState('sending');
    setSendError(null);
    const context = toContext(attachedPng, snapshot?.instrumentation ?? instrumentation);
    try {
      if (published) {
        await submitImprovement(game.token, trimmed, context);
      } else {
        await submitFeedback(game.token, trimmed, context);
      }
      setSendState('sent');
      setText('');
      clearSnapshot();
      if (paused) resume();
    } catch (err) {
      const apiErr = err as SubmissionApiError;
      const message = err instanceof Error ? err.message : '';
      if (message === 'content_rejected') {
        setSendError(t('errors.contentRejected.other'));
      } else if (message.includes('quota')) {
        setSendError(t('studioPanel.improve.quota'));
      } else if (apiErr.status === 429 || message.includes('too many')) {
        setSendError(t('studioPanel.improve.rateLimit'));
      } else {
        setSendError(t('studioPanel.improve.error'));
      }
      setSendState('idle');
    }
  };

  return (
    <div className="studio-playtest">
      {!html ? (
        <div className="studio-playtest-empty">
          <p className="panel-copy studio-playtest-hint">{t('studioPanel.playtest.hint')}</p>
          {waitingForPreview ? (
            <p className="studio-muted" aria-live="polite">
              {t('studioPanel.playtest.waitingForPreview')}
            </p>
          ) : loading ? (
            <p className="studio-muted">{t('studioPanel.playtest.loading')}</p>
          ) : null}
          {loadError ? <p className="error">{loadError}</p> : null}
          {/* Theater Close only exists once HTML loads; empty/error must still offer a
              labeled way back to the build thread (Testuj replaces that surface). */}
          <button type="button" className="secondary-btn" onClick={onExit} ref={exitRef}>
            <PixelIcon name="close" size={12} /> {t('studioPanel.playtest.backToThread')}
          </button>
        </div>
      ) : (
        <div
          className={`studio-playtest-theater${paused ? ' is-paused' : ''}${promptOpen ? ' is-prompting' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={t('studioPanel.playtest.theaterAria', { title: game.title })}
        >
          <div className="studio-playtest-bar">
            <div className="studio-playtest-bar-meta">
              <span className="studio-playtest-badge">{t('studioPanel.tabs.playtest')}</span>
              <h2 className="studio-playtest-title">{game.title}</h2>
              <span className="studio-playtest-meta">
                {t('studioPanel.playtest.played', { seconds: instrumentation.playSeconds })}
                {instrumentation.errors.length > 0
                  ? ` · ${t('studioPanel.playtest.errorCount', { count: instrumentation.errors.length })}`
                  : null}
              </span>
            </div>
            <div className="studio-playtest-bar-actions">
              {paused ? (
                <button type="button" className="secondary-btn" onClick={resume}>
                  <PixelIcon name="play" size={12} />
                  <span className="btn-label">{t('studioPanel.playtest.resume')}</span>
                </button>
              ) : (
                <button type="button" className="primary-btn" onClick={pause}>
                  <PixelIcon name="pause" size={12} />
                  <span className="btn-label">{t('studioPanel.playtest.pause')}</span>
                </button>
              )}
              <button
                type="button"
                className="secondary-btn exit-btn"
                onClick={onExit}
                ref={exitRef}
                aria-label={t('catalog.exitPlayer', { defaultValue: 'Close' })}
                title={t('catalog.exitPlayer', { defaultValue: 'Close' })}
              >
                <PixelIcon name="close" size={14} />
              </button>
            </div>
          </div>

          <div className="studio-playtest-viewport">
            <GameFrame frameRef={frameRef} title={game.title} html={html} embed />
            {needsLandscape ? (
              <div className="studio-playtest-rotate" role="status">
                <PixelIcon name="gamepad" size={14} />
                <span>{t('player.rotateLandscape')}</span>
              </div>
            ) : null}
          </div>

          {promptOpen ? (
            <div className="studio-playtest-sheet status-feedback">
              <h3 className="status-feedback-title">{t('studioPanel.playtest.promptTitle')}</h3>
              <p className="status-feedback-hint">{t('studioPanel.playtest.promptHint')}</p>

              {attachedPng ? (
                <figure className="studio-playtest-shot">
                  <img src={`data:image/png;base64,${attachedPng}`} alt="" />
                  <figcaption>{t('studioPanel.playtest.shotCaption')}</figcaption>
                </figure>
              ) : (
                <p className="studio-muted">{t('studioPanel.playtest.noShot')}</p>
              )}

              {(snapshot?.instrumentation ?? instrumentation).errors.length > 0 ? (
                <ul className="studio-playtest-errors">
                  {(snapshot?.instrumentation ?? instrumentation).errors.slice(-3).map((error) => (
                    <li key={error}>
                      <code>{error}</code>
                    </li>
                  ))}
                </ul>
              ) : null}

              <textarea
                className="status-feedback-input"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
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
                  onClick={() => void send()}
                  disabled={sendState === 'sending' || trimmed.length < 10}
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
      )}
    </div>
  );
}
