import { useCallback, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '../../catalog.js';
import { useGamePlayer } from '../../gamePlayer.js';
import { HowToPlayPanel } from '../../HowToPlayPanel.js';
import { resolveControlRows } from '../../howToPlay.js';
import type { RosterSlot } from '../../mp/protocol.js';
import { PixelIcon } from '../../PixelIcon.js';
import { PublishedGameFrame } from '../../PublishedGameFrame.js';
import type { PlayVia } from '../../visitTelemetry.js';

type PartyPlayingProps = {
  game: CatalogEntry;
  roster: RosterSlot[];
  frameRef: MutableRefObject<HTMLIFrameElement | null>;
  via?: PlayVia;
};

// Party bar owns the title; this strip carries sound and controls.
export function PartyPlaying({ game, roster, frameRef, via }: PartyPlayingProps) {
  const { t } = useTranslation();
  const [howToOpen, setHowToOpen] = useState(false);
  const player = useGamePlayer(frameRef, true);

  // What the game reports, else the catalog. Both land late.
  const controlRows = resolveControlRows(player.controls, game.controls ?? '');
  const hasControls =
    controlRows.length > 0 || Boolean(player.controls?.pad) || (player.controls?.padButtons.length ?? 0) > 0;

  // Keyboard slots play here, so buttons hand focus back.
  const returnFocus = useCallback(() => frameRef.current?.contentWindow?.focus(), [frameRef]);

  const closeHowTo = useCallback(() => {
    setHowToOpen(false);
    returnFocus();
  }, [returnFocus]);

  return (
    <div className="party-playing">
      <div className="party-slotstrip">
        {roster.map((slot) => (
          <span
            key={slot.slot}
            className={`party-chip ${slot.connected ? 'is-connected' : ''}`}
            style={{ borderColor: slot.color, color: slot.color }}
          >
            <span className="party-dot" style={{ background: slot.color }} />
            {slot.nick ?? t('party.keyboardSlot', { slot: slot.slot })}
          </span>
        ))}
        <div className="party-play-controls">
          {hasControls && (
            <button
              type="button"
              className="secondary-btn howto-btn"
              onClick={() => setHowToOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={howToOpen}
              aria-label={t('player.howToPlay')}
            >
              <PixelIcon name="gamepad" size={13} />
              <span className="btn-label">{t('player.howToPlay')}</span>
            </button>
          )}
          <button
            type="button"
            className="secondary-btn sound-btn"
            onClick={() => {
              player.toggleSound();
              returnFocus();
            }}
            aria-pressed={player.muted}
            aria-label={player.muted ? t('player.soundOff') : t('player.soundOn')}
          >
            <PixelIcon name={player.muted ? 'mute' : 'sound'} size={13} />
            <span className="btn-label">{player.muted ? t('player.soundOff') : t('player.soundOn')}</span>
          </button>
        </div>
      </div>
      <PublishedGameFrame
        slug={game.slug}
        title={game.title}
        frameRef={frameRef}
        slots={roster.filter((slot) => slot.connected).length}
        via={via}
        // Hides the game's own chrome; its canvas then fills the stage.
        embed
      />
      <HowToPlayPanel
        open={howToOpen}
        rows={controlRows}
        gameTitle={game.title}
        touch={game.touch}
        padReported={player.controls?.pad ?? false}
        padButtons={player.controls?.padButtons ?? []}
        onClose={closeHowTo}
      />
    </div>
  );
}
