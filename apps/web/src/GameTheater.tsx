import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { gamePageHandle, isPlatformAuthor, type CatalogTouch } from './catalog.js';
import { GameFrame } from './GameFrame.js';
import { HowToPlayPanel } from './HowToPlayPanel.js';
import { PublishedGameFrame } from './PublishedGameFrame.js';
import { PixelIcon, type PixelIconName } from './PixelIcon.js';
import { resolveControlRows } from './howToPlay.js';
import { PlayerFeedbackWidget } from './PlayerFeedbackWidget.js';
import { ReportGameButton } from './ReportGameButton.js';
import { ShareGameButton } from './ShareGameButton.js';
import { VoteWidget } from './VoteWidget.js';
import { useGamePlayer } from './gamePlayer.js';
import { useGamepadSpike } from './gamepadSpike.js';
import { recordRemixStep, recordVisitEvent, type PlayVia } from './visitTelemetry.js';
import { useGameSaveBridge } from './gameSave.js';
import { usePresenceBridge } from './presence.js';
import { useSensingBridge, type BackdropFacing } from './sensing.js';
import { useVoiceMeterBridge } from './voiceMeter.js';
import { useWorldBridge } from './world.js';
import { useZoneBridge } from './zone.js';
import { useScreenWakeLock } from './useScreenWakeLock.js';
import { creatorPath, gamePath } from './router.js';

/**
 * Shell-owned camera feed under the game iframe. Kept as a tiny component so the
 * `srcObject` attach/detach stays out of the theater's render body — swapping the
 * MediaStream must not remount the iframe.
 */
function BackdropVideo({ stream, facing }: { stream: MediaStream; facing: BackdropFacing }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // playsInline + muted is what lets iOS autoplay without a second gesture.
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={`theater-camera-backdrop${facing === 'user' ? ' is-mirrored' : ''}`}
      autoPlay
      muted
      playsInline
      disablePictureInPicture
      aria-hidden="true"
    />
  );
}

/** A game to run, sourced either from raw assembled HTML or a published slug. */
export type GameTheaterSource = { html: string } | { slug: string };

type GameTheaterProps = {
  title: string;
  badge: { icon: PixelIconName; label: string };
  source: GameTheaterSource;
  onExit: () => void;
  /** The orientation the game was designed for; drives the rotate nudge. */
  orientation?: 'any' | 'portrait' | 'landscape' | 'adaptive';
  /** Extra header content shown when the bridge hasn't reported a description yet
   *  (e.g. the prompt a generated game was made from). */
  meta?: ReactNode;
  /**
   * Slug of a *published* game, which turns on the "Report game" control (DSA art. 16),
   * the vote / feedback widgets, and share. Passed explicitly rather than derived from
   * `source`, because drafts and local mocks are also slug- or html-sourced and are
   * seen by their own creator only — there is nobody to report them to, their own
   * draft is not a signal worth a vote count, and a share of a draft needs the
   * status token.
   */
  reportSlug?: string;
  /**
   * Unverified creator attribution from the catalog (`submitted_by`). null / the
   * platform sentinel read as the site itself; anything else is shown as a byline.
   */
  submittedBy?: string | null;
  /** When set, the byline links to `/:handle`. */
  creatorHandle?: string | null;
  /**
   * The game's `controls` line from the catalog. A fallback now rather than the only
   * source: the player bridge reports the game's own control list, which is localized,
   * already split into key and action, and present on a deep link where the catalog is
   * never fetched. This still covers a game whose document reports nothing.
   */
  controls?: string;
  /** Catalog touch support; `none` adds the keyboard-only line to the panel. */
  touch?: CatalogTouch | null;
  // Which home page surface launched this play, if it did.
  via?: PlayVia;
  /** Open the remix sheet on the first frame (the game-page Remix entry). */
  initialRemixOpen?: boolean;
  /** A request written before theater entry; RemixPanel starts it once safely ready. */
  initialRemixRequest?: string;
  trackPlay?: boolean;
  remixable?: boolean;
};

// Long enough that the bar never reacts like a hover tooltip, short enough to clear
// the playfield once somebody has demonstrably started playing.
export const PLAYER_CHROME_IDLE_MS = 3200;

/**
 * True while a handheld is held the wrong way round for this game.
 *
 * Only handhelds are nudged: a desktop window can be any shape and its owner
 * resizes it rather than turning it over, so telling them to rotate is noise.
 */
function useOrientationMismatch(desired: 'any' | 'portrait' | 'landscape' | 'adaptive'): boolean {
  const [mismatched, setMismatched] = useState(false);

  useEffect(() => {
    // adaptive / any: the game follows the device — never nag to rotate.
    if (
      desired === 'any' ||
      desired === 'adaptive' ||
      typeof matchMedia !== 'function' ||
      !matchMedia('(pointer: coarse)').matches
    ) {
      setMismatched(false);
      return;
    }
    const query = matchMedia(`(orientation: ${desired})`);
    const update = () => setMismatched(!query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [desired]);

  return mismatched;
}

/**
 * The full-viewport game player ("theater"): a fixed overlay with a header bar
 * (badge, title, lifted description, sound toggle, exit) over the sandboxed game.
 * It owns the player bridge (see gamePlayer.ts) so the game's own title/description/
 * sound chrome is hidden and surfaced here instead. Callers own page scroll-locking
 * (`document.body.classList` 'player-open') and the overlay's mount lifecycle.
 */
export function GameTheater({
  title,
  badge,
  source,
  onExit,
  meta,
  orientation = 'any',
  reportSlug,
  submittedBy = null,
  creatorHandle = null,
  controls,
  touch = null,
  via,
  initialRemixOpen = false,
  initialRemixRequest,
  trackPlay = true,
  remixable = true,
}: GameTheaterProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const exitRef = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [playerEngaged, setPlayerEngaged] = useState(false);
  const [chromeIdle, setChromeIdle] = useState(false);
  const [chromeFocused, setChromeFocused] = useState(false);
  const [chromeManuallyHidden, setChromeManuallyHidden] = useState(false);
  /**
   * The always-available doors to Remix and its painter (ops repo,
   * remix-content-editing-plan §3.1): nonces the menu bumps, threaded down to
   * the frame. They complement the pause-moment invitation, which is untouched.
   * The painter entry appears only once the panel has reported this game
   * declares paintable content — a door that opens onto nothing is the
   * `no_lane` lesson, and this menu does not repeat it.
   */
  const [remixOpenNonce, setRemixOpenNonce] = useState(initialRemixOpen ? 1 : 0);
  const [painterNonce, setPainterNonce] = useState(0);
  const [remixHasPainter, setRemixHasPainter] = useState(false);
  const onRemixCapabilities = useCallback((caps: { painter: boolean }) => setRemixHasPainter(caps.painter), []);
  // Per theater mount, not per visit: opening once in game A and once in game B is not
  // a "card did not answer" signal. The theater remounts when the slug changes (`key`),
  // so this resets with each published play without needing a game identity on the wire.
  const howToOpenedOnceRef = useRef(false);

  // Playing is the one thing you do here without touching the screen for minutes at
  // a time, which is exactly when a phone dims and sleeps. Hold the screen awake.
  useScreenWakeLock(true);

  const rotateHint = useOrientationMismatch(orientation);

  // Callers routinely pass a fresh `onExit` closure on every render (and the status
  // view re-renders every few seconds while a build polls). Keeping it in a ref lets
  // the mount effect below stay mount-only: if it re-ran on each new identity it
  // would yank focus off the game and back onto the chrome mid-play.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const requestExit = useCallback(() => {
    // While fullscreen, Escape is the browser's own "leave fullscreen" gesture —
    // let it do just that and keep the game up. A second Escape then exits.
    if (document.fullscreenElement) return;
    onExitRef.current();
  }, []);
  // A tap inside the sandboxed game never bubbles to the document — the bridge
  // relays pointerdown so overlays like More can dismiss without covering the
  // playfield (which would steal that first tap from the game).
  const dismissMore = useCallback(() => setMoreOpen(false), []);

  // Escape while the How-to-play card is up must close the card, not throw the player
  // out of the game. Overlay state is read through refs so these callbacks keep a
  // stable identity and the listener below does not need re-binding on every toggle.
  const howToOpenRef = useRef(howToOpen);
  howToOpenRef.current = howToOpen;
  const moreOpenRef = useRef(moreOpen);
  moreOpenRef.current = moreOpen;

  // Play input starts the hide clock but never brings faded chrome back.
  const notePlayerActivity = useCallback(() => {
    setPlayerEngaged(true);
  }, []);

  const revealChrome = useCallback(() => {
    setChromeManuallyHidden(false);
    setPlayerEngaged(true);
    setChromeIdle(false);
  }, []);

  const notePlayerEnd = useCallback(() => {
    // A terminal screen is another orientation moment: surface exit/feedback/remix
    // controls and keep them there until the next round begins with fresh input.
    setPlayerEngaged(false);
    if (!chromeManuallyHidden) setChromeIdle(false);
  }, [chromeManuallyHidden]);

  const hideChrome = useCallback(() => {
    setChromeManuallyHidden(true);
    setChromeIdle(true);
    frameRef.current?.focus();
    frameRef.current?.contentWindow?.focus();
  }, []);

  // Closing hands focus to the game, not back to the trigger. In a player the next key
  // press is meant for the game: leaving focus on the button turns the next Space into
  // "reopen the card" instead of "fire".
  const closeHowTo = useCallback(() => {
    setHowToOpen(false);
    frameRef.current?.contentWindow?.focus();
  }, []);

  const escapeOrExit = useCallback(() => {
    if (howToOpenRef.current) {
      closeHowTo();
      return;
    }
    requestExit();
  }, [requestExit, closeHowTo]);

  const quitGame = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onExitRef.current();
  }, []);

  // Escape is handled twice on purpose: the window listener below covers the app's
  // own chrome, and this covers the game iframe, which holds focus while playing
  // and swallows its own key events.
  const player = useGamePlayer(
    frameRef,
    true,
    escapeOrExit,
    dismissMore,
    notePlayerActivity,
    notePlayerEnd,
    undefined,
    quitGame,
  );

  // What the game says about itself, falling back to what the catalog says about it.
  // Derived every render rather than memoized on first value, because both sources
  // arrive late and at different times: on a deep-linked /play/<slug> the catalog never
  // arrives at all (the placeholder entry's `controls` stays empty) and the bridge report
  // is the only source there, while the bridge itself re-reports once GameKit has wired
  // its input. Recomputing is what lets the control appear when either one lands.
  const controlRows = resolveControlRows(player.controls, controls ?? '');
  // A pad counts on its own. A generated game on a phone can mount an on-screen pad while
  // shipping no legend, no hint and no catalog entry — naming its buttons is the whole
  // answer to "how do I play this", and gating the control on keyboard rows hid it.
  const hasControls =
    controlRows.length > 0 || Boolean(player.controls?.pad) || (player.controls?.padButtons.length ?? 0) > 0;

  // Durable progress for games that ask for it (docs/persistent-world-plan.md P1).
  // Keyed on `reportSlug` — the *published* slug — for the same reason the vote and
  // feedback widgets are: a draft is rebuilt commit by commit, and progress saved
  // against a format the next build changes is worse than no progress at all. Games
  // that never open a slot cost nothing here; the bridge simply stays quiet.
  useGameSaveBridge(frameRef, reportSlug);

  // Shared worlds, for the games that declare one (P2). Keyed on the published slug
  // for the same reason and one more: a world is *shared*, so entries a draft wrote
  // against a shape it is about to change would be visible to every other player as
  // something the game can no longer render.
  useWorldBridge(frameRef, reportSlug);

  // And who is walking that world right now (P2.5). Mounted beside the world bridge
  // rather than inside it because the two answer different questions on different
  // clocks: a world changes when somebody acts, a roster changes when somebody arrives
  // or stops looking. A game that never asks for a roster costs this nothing.
  usePresenceBridge(frameRef, reportSlug);

  // Authoritative real-time zones (P3). Published slug again, and here the reason is
  // sharpest of the three: the host runs the *same* sim.ts the client predicts with, and
  // a draft's sim is rebuilt commit by commit — a client predicting with rules the
  // arbiter no longer has is a desync on the first tick.
  useZoneBridge(frameRef, reportSlug);

  // Loudness mic for shout games (voice-on-phones Layer 0). Opaque sandboxed iframes
  // cannot call getUserMedia; the theater header owns the gesture and relays levels.
  // Quiet until createVoiceMeter posts voice:hello.
  const voiceMeter = useVoiceMeterBridge(frameRef);

  // Device tilt for games that ask for it (games-repo camera-ar-platform Phase 0). Not
  // keyed on a slug: it touches no API and reads nothing durable — the shell relays
  // orientation readings into the frame, and the readings never leave the browser. On
  // iOS the sensor needs a real gesture on our own chrome, hence the bar control below.
  const sensing = useSensingBridge(frameRef);

  useGamepadSpike(frameRef);

  // The game reports its own (localized) title over the bridge. Prefer it: on a
  // direct `/play/<slug>` link there's no catalog entry to take a title from, so
  // the caller can only derive one from the slug.
  const displayTitle = player.meta?.title?.trim() || title;

  const authorLabel = submittedBy && !isPlatformAuthor(submittedBy) ? submittedBy : t('catalog.platformAuthor');
  const authorLink = creatorHandle && submittedBy && !isPlatformAuthor(submittedBy) ? creatorPath(creatorHandle) : null;

  // Fullscreen buys back the browser chrome — on a phone that's a third of the
  // screen. Unsupported on iPhone Safari, where `fullscreenEnabled` is false and
  // the control simply doesn't appear rather than failing on tap.
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = Boolean(document.fullscreenEnabled);
  // Phone bar is title · More · Exit; sound/fullscreen move into the menu. Track
  // the breakpoint in JS so we don't render an empty More control on desktop for
  // drafts that have no vote/share/report row.
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(max-width: 768px)');
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Where the how-to-play bar copy is hidden but the rest of the chrome is still on the
  // bar. Tracked in JS for the same reason `isNarrow` is: the menu must not be rendered
  // empty, so whether it exists is a render decision, not something CSS can make.
  const [isMidWidth, setIsMidWidth] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(max-width: 900px)');
    const update = () => setIsMidWidth(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    setMoreOpen(false);
    // The bar is unmounted while fullscreen, and it holds both of the card's triggers.
    // A card left open there cannot be reopened from anywhere, and reappears unbidden
    // when fullscreen ends.
    setHowToOpen(false);
  }, [fullscreen]);

  // Gated on real game input: chrome stays while somebody is still orienting.
  // Focused controls stay reachable; repeated gameplay input does not reset the clock.
  useEffect(() => {
    if (chromeManuallyHidden || chromeIdle) return;
    if (!playerEngaged || chromeFocused || moreOpen || howToOpen || fullscreen) {
      setChromeIdle(false);
      return;
    }
    const timer = window.setTimeout(() => setChromeIdle(true), PLAYER_CHROME_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [chromeFocused, chromeIdle, chromeManuallyHidden, fullscreen, howToOpen, moreOpen, playerEngaged]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void stageRef.current?.requestFullscreen?.().catch(() => undefined);
    }
    // Fullscreen moves focus to the element we expanded; hand it back to the game
    // so WASD keeps working without a click.
    setTimeout(() => frameRef.current?.contentWindow?.focus(), 100);
  }, []);

  // The theater takes over the whole viewport, so keyboard focus has to come with
  // it — otherwise focus is left behind on the page underneath, and Escape (the
  // reflex for "get me out of here") does nothing. Focus returns on unmount.
  //
  // Mount-only, and separate from the Escape listener below on purpose: this effect
  // used to carry `moreOpen` in its deps, so opening an overlay re-ran it and the
  // `exitRef.focus()` here landed *after* the overlay's own focus call (child effects
  // run before parent effects) — the card opened with focus on the exit button.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    exitRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      notePlayerActivity();
      if (event.key === 'Escape') {
        // Innermost surface first: the card, then the menu, then leaving the game.
        if (howToOpenRef.current) {
          closeHowTo();
          return;
        }
        if (moreOpenRef.current) {
          setMoreOpen(false);
          return;
        }
        requestExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestExit, closeHowTo, notePlayerActivity]);

  // Close the overflow menu on an outside tap — phones have no hover to dismiss it.
  // Same-document chrome uses pointerdown here. Taps on the sandboxed game are
  // relayed by the player bridge (useGamePlayer → dismissMore) so the playfield
  // stays interactive — focus tricks don't fire reliably on mobile, and a
  // covering backdrop would steal the first tap.
  // Defer one tick so the opening click cannot close the menu in the same gesture.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointer);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [moreOpen]);

  // The menu also has to exist wherever a control has shed into it. How-to-play and Mic
  // shed at 900px while sound and fullscreen shed at 768px, so between those widths a
  // game with no `reportSlug` (a draft, a generated game — no catalog entry, but the
  // game document still reports its own controls) — or a shout game that only needs Mic
  // — would have had the bar copy hidden by CSS and no menu to fall back to, and the
  // control would have vanished entirely.
  const showMoreMenu =
    Boolean(reportSlug) || isNarrow || (hasControls && isMidWidth) || (voiceMeter.available && isMidWidth);

  const soundControl = (className: string) => (
    <button
      type="button"
      className={className}
      onClick={player.toggleSound}
      aria-pressed={player.muted}
      aria-label={player.muted ? t('player.soundOff') : t('player.soundOn')}
    >
      <PixelIcon name={player.muted ? 'mute' : 'sound'} size={13} />
      <span className="btn-label">{player.muted ? t('player.soundOff') : t('player.soundOn')}</span>
    </button>
  );

  const micLabel =
    voiceMeter.status === 'pending'
      ? t('player.micPending')
      : voiceMeter.status === 'denied'
        ? t('player.micDenied')
        : voiceMeter.status === 'unsupported'
          ? t('player.micUnsupported')
          : voiceMeter.live
            ? t('player.micOn')
            : t('player.micOff');

  const micControl = (className: string) =>
    voiceMeter.available ? (
      <button
        type="button"
        className={className}
        onClick={voiceMeter.toggle}
        aria-pressed={voiceMeter.live}
        aria-label={micLabel}
        disabled={voiceMeter.status === 'unsupported' || voiceMeter.status === 'pending'}
      >
        <PixelIcon name="mic" size={13} />
        <span className="btn-label">{micLabel}</span>
      </button>
    ) : null;

  /**
   * The way into Remix, in both places chrome lives.
   *
   * It used to be a pill that faded in over the bottom-right of the running game
   * and pulsed twice. It was discoverable, and it was the only thing on the
   * screen moving for its own sake — on top of the game it was advertising. A
   * standard control asks for the space every other control gets.
   *
   * The trade is real and unmeasured, which is why `offered` exists beside
   * `opened`: a quieter door is only worth it if the clicks it costs are visible
   * rather than assumed, and the decision to make it quieter still (or louder
   * again) should be made against a number.
   */
  const remixControl = (className: string, control: 'bar' | 'more') =>
    remixable && 'slug' in source ? (
      <button
        type="button"
        className={className}
        onClick={() => {
          setMoreOpen(false);
          setRemixOpenNonce((nonce) => nonce + 1);
          // Recorded at the door rather than in the panel, because only the door
          // knows which one it was. The panel still records `opened` for the path
          // that has no door — a shared link that opens it on arrival — and the
          // step dedupes, so whichever came first wins and a click always does.
          recordRemixStep('opened', { control });
        }}
      >
        <PixelIcon name="wrench" size={13} />
        <span className="btn-label">{t('remix.button')}</span>
      </button>
    ) : null;

  // Every visit shown the control, whether or not it pressed it — the denominator
  // `opened` is read against. Fires on render, since being shown is the most the
  // client can honestly claim to know.
  useEffect(() => {
    if (!remixable || !('slug' in source)) return;
    recordRemixStep('offered');
  }, [remixable, source]);

  // The one thing a player needs before the first key press, and the game's own copy of
  // it is hidden inside the frame by HIDE_CHROME. Reuses `theater-menu-item` in the
  // overflow menu so the four hand-enumerated selector lists in styles.css keep working.
  const howToPlayControl = (className: string, via: 'bar' | 'more') =>
    hasControls ? (
      <button
        type="button"
        className={className}
        onClick={() => {
          setMoreOpen(false);
          setHowToOpen(true);
          // Same population as `play_started`: published games only. Drafts and
          // generated playtests must not inflate the open-rate numerator against a
          // denominator that only counts real catalog plays.
          if (!reportSlug) return;
          const reopen = howToOpenedOnceRef.current;
          howToOpenedOnceRef.current = true;
          recordVisitEvent({
            type: 'how_to_play_opened',
            via,
            ...(reopen ? { reopen: true as const } : {}),
          });
        }}
        aria-haspopup="dialog"
        aria-expanded={howToOpen}
        aria-label={t('player.howToPlay')}
      >
        <PixelIcon name="gamepad" size={13} />
        <span className="btn-label">{t('player.howToPlay')}</span>
      </button>
    ) : null;

  const fullscreenControl = (className: string) =>
    canFullscreen ? (
      <button
        type="button"
        className={className}
        onClick={toggleFullscreen}
        aria-pressed={fullscreen}
        aria-label={fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
      >
        <PixelIcon name={fullscreen ? 'collapse' : 'expand'} size={13} />
        <span className="btn-label">{fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}</span>
      </button>
    ) : null;

  return (
    <section
      className={`panel stage is-playing-full-viewport${fullscreen ? ' is-native-fullscreen' : ''}${chromeIdle ? ' is-player-idle' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle}
      ref={stageRef}
    >
      {/* Native fullscreen is the explicit immersive mode. Normal play keeps the bar
          mounted in a stable location and fades it only after demonstrated activity. */}
      {!fullscreen && chromeIdle && (
        <button
          type="button"
          className="theater-reveal-btn"
          aria-label={t('player.showControls')}
          title={t('player.showControls')}
          // Pointerdown makes the control immediate on touch. Click keeps the same
          // route available to Enter/Space, which do not emit pointer events.
          onPointerDown={revealChrome}
          onClick={revealChrome}
        >
          <PixelIcon name="chevronDown" size={15} />
        </button>
      )}
      {!fullscreen && (
        <div
          className={`game-theater-bar${chromeIdle ? ' is-idle' : ''}`}
          aria-hidden={chromeIdle}
          onFocusCapture={() => setChromeFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setChromeFocused(false);
          }}
        >
          <div className="game-theater-meta">
            <span className="theater-badge" title={t('ai.generatedTooltip')}>
              <PixelIcon name={badge.icon} size={12} /> {badge.label}
            </span>
            <h2 className="theater-title">
              <span className="theater-title-text">{displayTitle}</span>
              <span className="theater-author">
                {authorLink ? (
                  <>
                    {t('player.byAuthorPrefix')}
                    <a className="theater-author-link" href={authorLink}>
                      {authorLabel}
                    </a>
                  </>
                ) : (
                  t('player.byAuthor', { author: authorLabel })
                )}
              </span>
            </h2>
            {player.meta?.desc ? <span className="theater-desc">{player.meta.desc}</span> : meta}
          </div>
          <div className="game-theater-actions">
            {/* Thumbs are first-class: the one signal people expect without hunting. */}
            {reportSlug ? <VoteWidget slug={reportSlug} /> : null}
            {/* iOS only: motion needs a permission that must be requested from a real
                gesture on the shell's own chrome. Disappears once granted; on Android
                and desktop it never appears at all. */}
            {sensing.engaged && sensing.supported && sensing.needsPermission && (
              <button
                type="button"
                className="secondary-btn tilt-btn"
                onClick={sensing.request}
                title={t('sensing.explain')}
                aria-label={t('sensing.enableAria')}
              >
                <PixelIcon name="phone" size={13} />
                <span className="btn-label">{t('sensing.enable')}</span>
              </button>
            )}
            {/* Camera backdrop: always an explicit tap — never auto-start, even where
                the browser would not re-prompt. Stop swaps in place once live. */}
            {sensing.backdrop.engaged && sensing.backdrop.supported && !sensing.backdrop.live && (
              <button
                type="button"
                className="secondary-btn camera-btn"
                onClick={sensing.backdrop.start}
                title={sensing.hand.engaged ? t('sensing.cameraHandExplain') : t('sensing.cameraExplain')}
                aria-label={sensing.hand.engaged ? t('sensing.cameraHandStartAria') : t('sensing.cameraStartAria')}
              >
                <PixelIcon name="phone" size={13} />
                <span className="btn-label">{t('sensing.cameraStart')}</span>
              </button>
            )}
            {sensing.backdrop.engaged && sensing.backdrop.live && (
              <button
                type="button"
                className="secondary-btn camera-btn is-live"
                onClick={sensing.backdrop.stop}
                title={t('sensing.cameraLive')}
                aria-label={t('sensing.cameraStop')}
              >
                <PixelIcon name="phone" size={13} />
                <span className="btn-label">{t('sensing.cameraStop')}</span>
              </button>
            )}
            {/* Desktop: sound + fullscreen sit on the bar. Phone: they move into More. */}
            {howToPlayControl('secondary-btn howto-btn howto-bar', 'bar')}
            {soundControl('secondary-btn sound-btn theater-desktop-chrome')}
            {/* Mic sheds at 900px with How-to-play (not 768px with sound) — Polish
                "Mikrofon: …" labels otherwise clip the title at mid widths. */}
            {micControl('secondary-btn mic-btn mic-bar')}
            {fullscreenControl('secondary-btn fullscreen-btn theater-desktop-chrome')}
            {remixControl('secondary-btn remix-btn theater-desktop-chrome', 'bar')}
            {showMoreMenu && (
              <div className={`theater-more${moreOpen ? ' is-open' : ''}`} ref={moreRef}>
                <button
                  type="button"
                  className="secondary-btn theater-more-btn"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  aria-label={t('player.moreActions')}
                  onClick={() => setMoreOpen((open) => !open)}
                >
                  {/* Stay a hamburger when open — swapping to X sat next to Exit and
                      read as two close buttons. Highlight communicates open state. */}
                  <PixelIcon name="menu" size={14} />
                </button>
                <div className="theater-more-panel" role="menu">
                  {howToPlayControl('theater-menu-item howto-menu', 'more')}
                  {micControl('theater-menu-item mic-menu')}
                  {soundControl('theater-menu-item theater-mobile-chrome')}
                  {fullscreenControl('theater-menu-item theater-mobile-chrome')}
                  {remixable && 'slug' in source ? (
                    <>
                      {remixControl('theater-menu-item theater-mobile-chrome', 'more')}
                      {remixHasPainter ? (
                        <button
                          type="button"
                          className="theater-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMoreOpen(false);
                            setPainterNonce((nonce) => nonce + 1);
                          }}
                        >
                          <PixelIcon name="pencil" size={13} />
                          <span className="btn-label">{t('remix.editorButton')}</span>
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {reportSlug && (
                    <>
                      <div className="theater-menu-divider theater-mobile-chrome" role="separator" />
                      <PlayerFeedbackWidget slug={reportSlug} />
                      {/* The way out of the player and onto the game's own page —
                          releases, code, the board. Every published game has one. */}
                      <a className="theater-menu-item" href={gamePath(gamePageHandle({ creatorHandle }), reportSlug)}>
                        <PixelIcon name="folder" size={13} /> {t('player.aboutGame')}
                      </a>
                      {/* Shares the play permalink: someone handed a game link expects
                          to land in the game. The game page shares itself instead. */}
                      <ShareGameButton slug={reportSlug} title={displayTitle} />
                      <ReportGameButton slug={reportSlug} title={displayTitle} />
                    </>
                  )}
                </div>
              </div>
            )}
            <button
              type="button"
              className="secondary-btn theater-hide-btn"
              onClick={hideChrome}
              aria-label={t('player.hideControls')}
              title={t('player.hideControls')}
            >
              <PixelIcon name="chevronUp" size={15} />
            </button>
            <button
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
      )}
      <div className={`game-viewport-container${sensing.backdrop.live ? ' has-camera-backdrop' : ''}`}>
        {/* Shell-owned camera under the sandboxed iframe. Pixels never cross the
            bridge — the game only learns a boolean. Mirrored for front camera. */}
        {sensing.backdrop.live && sensing.backdrop.stream ? (
          <BackdropVideo stream={sensing.backdrop.stream} facing={sensing.backdrop.facing} />
        ) : null}
        {'slug' in source ? (
          <PublishedGameFrame
            key={source.slug}
            slug={source.slug}
            title={title}
            frameRef={frameRef}
            embed
            via={via}
            remixable={remixable}
            trackPlay={trackPlay}
            remixOpenNonce={remixOpenNonce}
            initialRemixRequest={initialRemixRequest}
            painterNonce={painterNonce}
            onRemixCapabilities={onRemixCapabilities}
          />
        ) : (
          <GameFrame title={title} html={source.html} frameRef={frameRef} embed />
        )}
        {sensing.backdrop.live ? (
          <div className="theater-camera-indicator" role="status" aria-live="polite">
            <span className="theater-camera-dot" aria-hidden="true" />
            {t('sensing.cameraLive')}
            {sensing.hand.engaged
              ? sensing.hand.tracking
                ? ` · ${t('sensing.handTracking')}`
                : ` · ${t('sensing.handLoading')}`
              : null}
          </div>
        ) : null}
        {/* A nudge, not a gate: the game stays playable and running underneath, and
            the hint clears itself the moment the device is turned. */}
        {rotateHint && (
          <div className="theater-rotate-hint" role="status">
            <PixelIcon name="phone" size={20} />
            <span>{orientation === 'landscape' ? t('player.rotateLandscape') : t('player.rotatePortrait')}</span>
          </div>
        )}
      </div>
      {/* After the iframe in DOM order + high z-index so it isn't buried under the
          game surface. Escape still exits fullscreen via the browser. */}
      {fullscreen ? (
        <button
          type="button"
          className="theater-exit-fullscreen"
          onClick={toggleFullscreen}
          aria-label={t('player.exitFullscreen')}
          title={t('player.exitFullscreen')}
        >
          <PixelIcon name="close" size={16} />
        </button>
      ) : null}
      <HowToPlayPanel
        open={howToOpen}
        rows={controlRows}
        gameTitle={displayTitle}
        touch={touch}
        padReported={player.controls?.pad ?? false}
        padButtons={player.controls?.padButtons ?? []}
        onClose={closeHowTo}
      />
    </section>
  );
}
