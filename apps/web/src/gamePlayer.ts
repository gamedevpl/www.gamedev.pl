import type { Locale } from '@gamedevpl/contract';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { isPlayTimeAccruing, TelemetrySession, type TelemetryEvent } from './telemetry.js';
import { readReportedControls, type ReportedControls } from './howToPlay.js';
import { recordVisitEvent, type PlayVia } from './visitTelemetry.js';

export { embedGameHtml } from '@gamedevpl/contract';
const HOST = 'gdpl-host';
const PLAYER = 'gdpl-player';

/**
 * Sends one host message into an embedded game frame.
 *
 * The bridge's contract (`pause`, `resume`, `setSound`, `capture`, `hello`,
 * `snapshotState`, `restoreState`) is useful to callers that want none of the state the
 * hooks below keep — the floating live preview wants to mute and freeze a frame it never
 * subscribes to. Exported because the envelope tag lives only in this file.
 */
export function postGameHostMessage(frame: HTMLIFrameElement | null, message: Record<string, unknown>): void {
  frame?.contentWindow?.postMessage({ source: HOST, ...message }, '*');
}

// Awaits one reply of `type` from `frame`, or null/false after `timeoutMs`.
function awaitBridgeReply<T>(
  frame: HTMLIFrameElement | null,
  type: string,
  extract: (data: Record<string, unknown>) => T,
  fallback: T,
  timeoutMs: number,
): Promise<T> {
  const contentWindow = frame?.contentWindow;
  if (!contentWindow) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(fallback);
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.origin !== 'null') return;
      if (event.source !== null && event.source !== contentWindow) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (!data || data.source !== PLAYER || data.type !== type) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(extract(data as Record<string, unknown>));
    }
    window.addEventListener('message', onMessage);
  });
}

// Null on a game with no `.persist(...)` declared, or on timeout.
export function requestStateSnapshot(frame: HTMLIFrameElement | null, timeoutMs = 400): Promise<unknown | null> {
  const reply = awaitBridgeReply(frame, 'stateSnapshot', (data) => data.data ?? null, null, timeoutMs);
  postGameHostMessage(frame, { type: 'snapshotState' });
  return reply;
}

// False means the game declined or the request timed out.
export function requestStateRestore(frame: HTMLIFrameElement | null, data: unknown, timeoutMs = 400): Promise<boolean> {
  const reply = awaitBridgeReply(frame, 'stateRestored', (msg) => Boolean(msg.ok), false, timeoutMs);
  postGameHostMessage(frame, { type: 'restoreState', data });
  return reply;
}

/** en/pl are the only locales games ship strings for; anything else maps to en. */
export function toGameLocale(lang: string | undefined | null): Locale {
  return lang?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

/**
 * Rewrites the assembled game document's `<html lang="…">` so the game's own i18n
 * (games repo `shared/modules/core.ts` → resolveLocale, which reads
 * `document.documentElement.lang`) follows the app's selected language instead of
 * the sandboxed iframe's `navigator.language`. Without this, toggling the app to
 * Polish had no effect inside the game. A no-op when the fragment has no `<html>`
 * tag (e.g. test snippets), and it can only ever set en/pl.
 */
export function withGameLocale(html: string, lang: string | undefined | null): string {
  const locale = toGameLocale(lang);
  if (/<html\b[^>]*\slang\s*=/i.test(html)) {
    return html.replace(/(<html\b[^>]*?\slang\s*=\s*)("[^"]*"|'[^']*')/i, `$1"${locale}"`);
  }
  return html.replace(/<html\b/i, `<html lang="${locale}"`);
}

/**
 * Records one play session of a published game (docs/improvement-loop-plan.md IL-1).
 *
 * Lives here rather than in `GameTheater` on purpose: the theater also stages drafts
 * and multiplayer, and a creator playtesting their own work-in-progress is developer
 * traffic that must not land in the funnel. Mounting alongside the *published* game
 * makes "is this a real play of a real game" a structural fact instead of a condition
 * someone has to remember to write.
 */
/**
 * The open play session, for shell code that observes something the game cannot report.
 *
 * Zones are the case this exists for: whether an open became a *shared* world is known
 * to the shell (it owns the socket) and must not be reported by the game (a frame that
 * could claim `joined` could claim to be multiplayer while sitting alone). Everything a
 * game may say still arrives over postMessage and is validated there; this is the other
 * direction and is deliberately not reachable from inside the frame.
 *
 * Null between opens, so a stray late call records nothing rather than attaching to
 * whatever game is open next.
 */
let openSession: TelemetrySession | null = null;

/**
 * Take a recorder bound to the session open *now*, for shell code whose callbacks may
 * outlive it.
 *
 * Binding rather than looking the session up per call is the whole point. A WebSocket
 * frame can arrive after the bridge has torn down — `close()` closes the socket
 * asynchronously and the message handler does not check for disposal — so a recorder
 * that dereferenced a module global at callback time would attribute a late snapshot
 * from one game to whichever game opened next, marking a session `joined` that never
 * connected. A bound recorder cannot: once its session closes, `record` refuses, and the
 * stale event lands nowhere instead of on somebody else's row.
 *
 * Returns a no-op when nothing is open, which is the honest outcome — a zone whose
 * `admitted` was never recorded contributes no denominator and so no ratio either.
 */
export function bindPlayRecorder(): (event: TelemetryEvent) => void {
  const session = openSession;
  if (!session) return () => {};
  return (event) => void session.record(event);
}

/**
 * @param active Whether the frame is actually on screen. The game page keeps the frame
 *   mounted while the visitor reads another tab so their run is not restarted, and a
 *   hidden frame that kept accruing `play_time` would inflate focused play time and
 *   every scorecard derived from it. Deliberately **not** folded into `enabled`:
 *   tearing the session down and rebuilding it on each tab switch would emit a fresh
 *   `game_opened` and `play_started` every time, inflating the denominators instead.
 *   Read through a ref so toggling it never re-runs the effect.
 */
export function useGameTelemetry(slug: string, enabled: boolean, slots?: number, active = true, via?: PlayVia) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!enabled) return;

    const session = new TelemetrySession(slug, crypto.randomUUID());
    openSession = session;
    session.record({ type: 'game_opened', ...(slots === undefined ? {} : { slots }) });
    // The same moment, counted in the visit stream — deliberately without the slug, so
    // depth ("did this sitting play a second game") is answerable while "which games did
    // this tab play" stays unanswerable.
    recordVisitEvent({ type: 'play_started', ...(via === undefined ? {} : { via }) });
    // Sent immediately rather than batched. Every other event can afford to wait, but
    // a tab that is killed outright runs no cleanup and flushes nothing — and an open
    // we never hear about is a hole in the denominator of every ratio downstream.
    session.flush();

    // Heartbeat rather than a start/stop stopwatch: a tab can be closed, crash, or be
    // discarded without ever running cleanup, and a session that ends that way should
    // still have its play time up to the last tick. Each beat is only claimed after
    // the interval has actually elapsed with the page focused.
    const heartbeatSec = 15;
    const timer = window.setInterval(() => {
      if (activeRef.current && isPlayTimeAccruing(document)) {
        session.record({ type: 'play_time', seconds: heartbeatSec });
      }
    }, heartbeatSec * 1000);

    // Health and depth from inside the frame. `progress`/`score`/`end` arrive only
    // from games using the games-repo telemetry module; nothing sends them yet, and
    // accepting them now means adding it later touches no app code.
    function onMessage(event: MessageEvent) {
      // Sandboxed game frames (no allow-same-origin) report origin "null".
      // Reject anything else so a hostile frame can't spoof player telemetry.
      if (event.origin !== 'null') return;
      const data = event.data as {
        source?: string;
        type?: string;
        message?: string;
        frames?: number;
        label?: string;
        value?: number;
        outcome?: 'won' | 'lost' | 'quit';
        gfxBackend?: 'canvas2d' | 'webgl' | 'webgl3d';
      };
      if (!data || data.source !== PLAYER) return;
      switch (data.type) {
        case 'error':
          session.record({ type: 'error', message: String(data.message ?? '') });
          break;
        case 'alive':
          // Only while the player is actually watching — frames reported by a
          // backgrounded tab say nothing about whether the game works.
          if (isPlayTimeAccruing(document)) session.record({ type: 'alive', frames: Number(data.frames ?? 0) });
          break;
        case 'progress':
          session.record({
            type: 'progress',
            label: String(data.label ?? ''),
            ...(data.gfxBackend === 'canvas2d' || data.gfxBackend === 'webgl' || data.gfxBackend === 'webgl3d'
              ? { gfxBackend: data.gfxBackend }
              : {}),
          });
          break;
        case 'score':
          session.record({ type: 'score', value: Number(data.value) });
          break;
        case 'end':
          if (data.outcome) {
            session.record({
              type: 'end',
              outcome: data.outcome,
              ...(data.gfxBackend === 'canvas2d' || data.gfxBackend === 'webgl' || data.gfxBackend === 'webgl3d'
                ? { gfxBackend: data.gfxBackend }
                : {}),
            });
          }
          break;
      }
    }
    window.addEventListener('message', onMessage);

    // A hidden tab may never get another frame of script, so flush on the way out
    // instead of hoping for unmount.
    function onHide() {
      if (document.visibilityState === 'hidden') session.flush();
    }
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onHide);
      session.record({ type: 'game_closed' });
      session.close();
      if (openSession === session) openSession = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- via read via closure
  }, [slug, enabled, slots]);
}

export type GamePlayerMeta = { title: string; desc: string };

/**
 * Subscribes to the player bridge for the currently-embedded game iframe and
 * exposes its title/description, the controls it reports, and a sound toggle the
 * header can drive. `active` gates the subscription so it only runs while a
 * single-player game is on stage.
 */
export function useGamePlayer(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  active: boolean,
  /** Called when Escape is pressed *inside* the game (see the bridge's job 4). */
  onEscape?: () => void,
  /** Called on pointerdown inside the game (see the bridge's job 5). */
  onPointer?: () => void,
  /** Called on discrete player input (keydown / pointerdown) so chrome can idle (job 6). */
  onActivity?: () => void,
  /** Called when the game reports a terminal round state. */
  onEnd?: () => void,
  // A pointer or touch is held down, or released.
  onPointerHeldChange?: (held: boolean) => void,
  onExitGame?: () => void,
) {
  const [meta, setMeta] = useState<GamePlayerMeta | null>(null);
  const [controls, setControls] = useState<ReportedControls | null>(null);
  const [muted, setMuted] = useState(false);

  // Held in refs so a caller's inline closures can't resubscribe the listener below.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const onPointerRef = useRef(onPointer);
  onPointerRef.current = onPointer;
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onPointerHeldChangeRef = useRef(onPointerHeldChange);
  onPointerHeldChangeRef.current = onPointerHeldChange;
  const onExitGameRef = useRef(onExitGame);
  onExitGameRef.current = onExitGame;

  useEffect(() => {
    if (!active) {
      setMeta(null);
      setControls(null);
      setMuted(false);
      return;
    }
    let hasShellMenu = false;
    // A changed loadId (window.__GDPL_LOAD_ID__) means a new document swapped in.
    let lastLoadId: unknown;
    function onMessage(event: MessageEvent) {
      // Opaque-origin sandboxed iframe → origin string is "null".
      if (event.origin !== 'null') return;
      // Also pin to this theater's iframe so any other null-origin frame can't
      // spoof gdpl-player traffic. Synthetic MessageEvents in unit tests omit
      // `source` (null) — still accept those so the handler path is exercised.
      if (event.source !== null && event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as {
        source?: string;
        type?: string;
        title?: string;
        desc?: string;
        muted?: boolean;
        key?: string;
        held?: boolean;
        loadId?: unknown;
      };
      if (!data || data.source !== PLAYER) return;
      if (data.loadId !== lastLoadId) {
        lastLoadId = data.loadId;
        hasShellMenu = false;
      }
      if (data.type === 'meta') {
        setMeta({ title: String(data.title ?? ''), desc: String(data.desc ?? '') });
        setMuted(Boolean(data.muted));
      } else if (data.type === 'controls') {
        // The bridge re-sends this (i18n and GameKit both land after load), so a later
        // report replaces an earlier one — but a report with nothing in it never clears
        // one that had something, or a game that swaps its own chrome would blank the
        // card mid-play.
        const next = readReportedControls(data);
        if (next) setControls(next);
      } else if (data.type === 'sound') {
        setMuted(Boolean(data.muted));
      } else if (data.type === 'shell-menu') {
        hasShellMenu = true;
      } else if (data.type === 'exit-game') {
        onExitGameRef.current?.();
      } else if (data.type === 'key' && data.key === 'Escape') {
        if (!hasShellMenu) onEscapeRef.current?.();
      } else if (data.type === 'pointer') {
        onPointerRef.current?.();
        onActivityRef.current?.();
      } else if (data.type === 'activity') {
        onActivityRef.current?.();
      } else if (data.type === 'held') {
        onPointerHeldChangeRef.current?.(Boolean(data.held));
      } else if (data.type === 'end') {
        onEndRef.current?.();
      }
    }
    window.addEventListener('message', onMessage);
    // The bridge auto-posts its meta on load, but if it booted before this
    // listener attached (or the game was swapped), nudge it a few times.
    let tries = 0;
    const timer = window.setInterval(() => {
      frameRef.current?.contentWindow?.postMessage({ source: HOST, type: 'hello' }, '*');
      if (++tries >= 5) window.clearInterval(timer);
    }, 200);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
    };
  }, [active, frameRef]);

  const toggleSound = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      frameRef.current?.contentWindow?.postMessage({ source: HOST, type: 'setSound', muted: next }, '*');
      return next;
    });
  }, [frameRef]);

  return { meta, controls, muted, toggleSound };
}

/** Instrumentation gathered while a creator playtests inside Studio. */
export type PlaytestInstrumentation = {
  playSeconds: number;
  lastAliveFrames: number | null;
  errors: string[];
  progress: string[];
};

export type PlaytestSnapshot = {
  pngBase64: string | null;
  paused: boolean;
  reason: 'pause' | 'capture' | string;
  instrumentation: PlaytestInstrumentation;
};

/**
 * Creator Studio playtest controls over the player bridge.
 *
 * The sandbox has no `allow-same-origin`, so the parent cannot screenshot the
 * frame — pause/capture asks the injected bridge, which replies with a full
 * viewport composite (canvases / videos / images) plus live health fields.
 */
export function useCreatorPlaytest(frameRef: MutableRefObject<HTMLIFrameElement | null>, active: boolean) {
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<PlaytestSnapshot | null>(null);
  const [instrumentation, setInstrumentation] = useState<PlaytestInstrumentation>({
    playSeconds: 0,
    lastAliveFrames: null,
    errors: [],
    progress: [],
  });
  const startedAtRef = useRef<number | null>(null);
  const instrumentationRef = useRef(instrumentation);
  instrumentationRef.current = instrumentation;

  useEffect(() => {
    if (!active) {
      setPaused(false);
      setSnapshot(null);
      setInstrumentation({ playSeconds: 0, lastAliveFrames: null, errors: [], progress: [] });
      startedAtRef.current = null;
      return;
    }
    startedAtRef.current = performance.now();

    function onMessage(event: MessageEvent) {
      const data = event.data as {
        source?: string;
        type?: string;
        message?: string;
        frames?: number;
        label?: string;
        png?: string | null;
        paused?: boolean;
        reason?: string;
        aliveFrames?: number;
      };
      if (!data || data.source !== PLAYER) return;

      if (data.type === 'error' && data.message) {
        setInstrumentation((prev) => ({
          ...prev,
          errors: [...prev.errors, String(data.message)].slice(-10),
        }));
        return;
      }
      if (data.type === 'alive') {
        setInstrumentation((prev) => ({
          ...prev,
          lastAliveFrames: Number(data.frames ?? 0),
          playSeconds: startedAtRef.current
            ? Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000))
            : prev.playSeconds,
        }));
        return;
      }
      if (data.type === 'progress' && data.label) {
        setInstrumentation((prev) => ({
          ...prev,
          progress: [...prev.progress, String(data.label)].slice(-20),
        }));
        return;
      }
      if (data.type === 'snapshot') {
        const live: PlaytestInstrumentation = {
          ...instrumentationRef.current,
          playSeconds: startedAtRef.current
            ? Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000))
            : instrumentationRef.current.playSeconds,
          lastAliveFrames:
            typeof data.aliveFrames === 'number' ? data.aliveFrames : instrumentationRef.current.lastAliveFrames,
        };
        setInstrumentation(live);
        setPaused(Boolean(data.paused));
        setSnapshot({
          pngBase64: typeof data.png === 'string' && data.png.length > 0 ? data.png : null,
          paused: Boolean(data.paused),
          reason: data.reason ?? 'capture',
          instrumentation: live,
        });
        return;
      }
      if (data.type === 'resumed') {
        setPaused(false);
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active]);

  const post = useCallback(
    (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ source: HOST, ...message }, '*');
    },
    [frameRef],
  );

  const pause = useCallback(() => post({ type: 'pause' }), [post]);
  const resume = useCallback(() => post({ type: 'resume' }), [post]);
  const capture = useCallback(() => post({ type: 'capture' }), [post]);
  const clearSnapshot = useCallback(() => setSnapshot(null), []);

  return { paused, snapshot, instrumentation, pause, resume, capture, clearSnapshot };
}
