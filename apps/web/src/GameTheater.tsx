import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isPlatformAuthor, type CatalogTouch } from './catalog.js';
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
import { recordVisitEvent } from './visitTelemetry.js';
import { useGameSaveBridge } from './gameSave.js';
import { usePresenceBridge } from './presence.js';
import { useSensingBridge } from './sensing.js';
import { useWorldBridge } from './world.js';
import { useZoneBridge } from './zone.js';
import { useScreenWakeLock } from './useScreenWakeLock.js';

/** A game to run, sourced either from raw assembled HTML or a published slug. */
export type GameTheaterSource = { html: string } | { slug: string };

type GameTheaterProps = {
  title: string;
  badge: { icon: PixelIconName; label: string };
  source: GameTheaterSource;
  onExit: () => void;
  /** The orientation the game was designed for; drives the rotate nudge. */
  orientation?: 'any' | 'portrait' | 'landscape';
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
  /**
   * The game's `controls` line from the catalog. A fallback now rather than the only
   * source: the player bridge reports the game's own control list, which is localized,
   * already split into key and action, and present on a deep link where the catalog is
   * never fetched. This still covers a game whose document reports nothing.
   */
  controls?: string;
  /** Catalog touch support; `none` adds the keyboard-only line to the panel. */
  touch?: CatalogTouch | null;
};

/**
 * True while a handheld is held the wrong way round for this game.
 *
 * Only handhelds are nudged: a desktop window can be any shape and its owner
 * resizes it rather than turning it over, so telling them to rotate is noise.
 */
function useOrientationMismatch(desired: 'any' | 'portrait' | 'landscape'): boolean {
  const [mismatched, setMismatched] = useState(false);

  useEffect(() => {
    if (desired === 'any' || typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches) {
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
  controls,
  touch = null,
}: GameTheaterProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const exitRef = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
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

  // Escape is handled twice on purpose: the window listener below covers the app's
  // own chrome, and this covers the game iframe, which holds focus while playing
  // and swallows its own key events.
  const player = useGamePlayer(frameRef, true, escapeOrExit, dismissMore);

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

  // Device tilt for games that ask for it (games-repo camera-ar-platform Phase 0). Not
  // keyed on a slug: it touches no API and reads nothing durable — the shell relays
  // orientation readings into the frame, and the readings never leave the browser. On
  // iOS the sensor needs a real gesture on our own chrome, hence the bar control below.
  const sensing = useSensingBridge(frameRef);

  // The game reports its own (localized) title over the bridge. Prefer it: on a
  // direct `/play/<slug>` link there's no catalog entry to take a title from, so
  // the caller can only derive one from the slug.
  const displayTitle = player.meta?.title?.trim() || title;

  const authorLabel = submittedBy && !isPlatformAuthor(submittedBy) ? submittedBy : t('catalog.platformAuthor');

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
  }, [requestExit, closeHowTo]);

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

  // The menu also has to exist wherever a control has shed into it. How-to-play sheds at
  // 900px while sound and fullscreen shed at 768px, so between those widths a game with
  // no `reportSlug` (a draft, a generated game — no catalog entry, but the game document
  // still reports its own controls) would have had the bar copy hidden by CSS and no menu
  // to fall back to, and the control would have vanished entirely.
  const showMoreMenu = Boolean(reportSlug) || isNarrow || (hasControls && isMidWidth);

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
      className={`panel stage is-playing-full-viewport${fullscreen ? ' is-native-fullscreen' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle}
      ref={stageRef}
    >
      {/* Fullscreen hides the bar so the game owns the screen. Votes stay on the
          bar when it's visible; secondary actions stay in More. */}
      {!fullscreen && (
        <div className="game-theater-bar">
          <div className="game-theater-meta">
            <span className="theater-badge" title={t('ai.generatedTooltip')}>
              <PixelIcon name={badge.icon} size={12} /> {badge.label}
            </span>
            <h2 className="theater-title">
              <span className="theater-title-text">{displayTitle}</span>
              <span className="theater-author">{t('player.byAuthor', { author: authorLabel })}</span>
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
            {/* Desktop: sound + fullscreen sit on the bar. Phone: they move into More. */}
            {howToPlayControl('secondary-btn howto-btn howto-bar', 'bar')}
            {soundControl('secondary-btn sound-btn theater-desktop-chrome')}
            {fullscreenControl('secondary-btn fullscreen-btn theater-desktop-chrome')}
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
                  {soundControl('theater-menu-item theater-mobile-chrome')}
                  {fullscreenControl('theater-menu-item theater-mobile-chrome')}
                  {reportSlug && (
                    <>
                      <div className="theater-menu-divider theater-mobile-chrome" role="separator" />
                      <PlayerFeedbackWidget slug={reportSlug} />
                      <ShareGameButton slug={reportSlug} title={displayTitle} />
                      <ReportGameButton slug={reportSlug} title={displayTitle} />
                    </>
                  )}
                </div>
              </div>
            )}
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
      <div className="game-viewport-container">
        {'slug' in source ? (
          <PublishedGameFrame key={source.slug} slug={source.slug} title={title} frameRef={frameRef} embed />
        ) : (
          <GameFrame title={title} html={source.html} frameRef={frameRef} embed />
        )}
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
