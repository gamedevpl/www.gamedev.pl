import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame';
import { PublishedGameFrame } from './PublishedGameFrame';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { useGamePlayer } from './gamePlayer';
import { useScreenWakeLock } from './useScreenWakeLock';

/** A game to run, sourced either from raw assembled HTML or a published slug. */
export type GameTheaterSource = { html: string } | { slug: string };

type GameTheaterProps = {
  title: string;
  badge: { icon: PixelIconName; label: string };
  source: GameTheaterSource;
  onExit: () => void;
  /** Extra header content shown when the bridge hasn't reported a description yet
   *  (e.g. the prompt a generated game was made from). */
  meta?: ReactNode;
};

/**
 * The full-viewport game player ("theater"): a fixed overlay with a header bar
 * (badge, title, lifted description, sound toggle, exit) over the sandboxed game.
 * It owns the player bridge (see gamePlayer.ts) so the game's own title/description/
 * sound chrome is hidden and surfaced here instead. Callers own page scroll-locking
 * (`document.body.classList` 'player-open') and the overlay's mount lifecycle.
 */
export function GameTheater({ title, badge, source, onExit, meta }: GameTheaterProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const exitRef = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);

  // Playing is the one thing you do here without touching the screen for minutes at
  // a time, which is exactly when a phone dims and sleeps. Hold the screen awake.
  useScreenWakeLock(true);

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
  // Escape is handled twice on purpose: the window listener below covers the app's
  // own chrome, and this covers the game iframe, which holds focus while playing
  // and swallows its own key events.
  const player = useGamePlayer(frameRef, true, requestExit);

  // The game reports its own (localized) title over the bridge. Prefer it: on a
  // direct `#/play/<slug>` link there's no catalog entry to take a title from, so
  // the caller can only derive one from the slug.
  const displayTitle = player.meta?.title?.trim() || title;

  // Fullscreen buys back the browser chrome — on a phone that's a third of the
  // screen. Unsupported on iPhone Safari, where `fullscreenEnabled` is false and
  // the control simply doesn't appear rather than failing on tap.
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = Boolean(document.fullscreenEnabled);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

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
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    exitRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestExit();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [requestExit]);

  return (
    <section
      className="panel stage is-playing-full-viewport"
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle}
      ref={stageRef}
    >
      <div className="game-theater-bar">
        <div className="game-theater-meta">
          <span className="theater-badge">
            <PixelIcon name={badge.icon} size={13} /> {badge.label}
          </span>
          <h2 className="theater-title">{displayTitle}</h2>
          {player.meta?.desc ? <span className="theater-desc">{player.meta.desc}</span> : meta}
        </div>
        <div className="game-theater-actions">
          {/* Labels collapse to icons on a phone (see .btn-label), so every control
              carries an aria-label of its own rather than relying on its text. */}
          <button
            className="secondary-btn sound-btn"
            onClick={player.toggleSound}
            aria-pressed={player.muted}
            aria-label={player.muted ? t('player.soundOff') : t('player.soundOn')}
          >
            <PixelIcon name={player.muted ? 'mute' : 'sound'} size={13} />
            <span className="btn-label">{player.muted ? t('player.soundOff') : t('player.soundOn')}</span>
          </button>
          {canFullscreen && (
            <button
              className="secondary-btn fullscreen-btn"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              aria-label={fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
            >
              <PixelIcon name={fullscreen ? 'collapse' : 'expand'} size={13} />
              <span className="btn-label">{fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}</span>
            </button>
          )}
          <button
            className="secondary-btn exit-btn"
            onClick={onExit}
            ref={exitRef}
            aria-label={t('catalog.exitPlayer', { defaultValue: 'Exit Player' })}
          >
            <PixelIcon name="close" size={12} />
            <span className="btn-label">{t('catalog.exitPlayer', { defaultValue: 'Exit Player' })}</span>
          </button>
        </div>
      </div>
      <div className="game-viewport-container">
        {'slug' in source ? (
          <PublishedGameFrame key={source.slug} slug={source.slug} title={title} frameRef={frameRef} embed />
        ) : (
          <GameFrame title={title} html={source.html} frameRef={frameRef} embed />
        )}
      </div>
    </section>
  );
}
