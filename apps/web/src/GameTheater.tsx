import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame';
import { PublishedGameFrame } from './PublishedGameFrame';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { useGamePlayer } from './gamePlayer';

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
  const player = useGamePlayer(frameRef, true);

  return (
    <section className="panel stage is-playing-full-viewport">
      <div className="game-theater-bar">
        <div className="game-theater-meta">
          <span className="theater-badge">
            <PixelIcon name={badge.icon} size={13} /> {badge.label}
          </span>
          <h2 className="theater-title">{title}</h2>
          {player.meta?.desc ? <span className="theater-desc">{player.meta.desc}</span> : meta}
        </div>
        <div className="game-theater-actions">
          <button className="secondary-btn sound-btn" onClick={player.toggleSound} aria-pressed={player.muted}>
            {player.muted ? t('player.soundOff') : t('player.soundOn')}
          </button>
          <button className="secondary-btn exit-btn" onClick={onExit}>
            <PixelIcon name="close" size={12} /> {t('catalog.exitPlayer', { defaultValue: 'Exit Player' })}
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
