import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { parseControls } from './howToPlay.js';

type HowToPlayPanelProps = {
  open: boolean;
  /** The game's `controls` string from the catalog. Free text; rendered as text nodes. */
  controls: string;
  /** Shown as the panel's subtitle so it is obvious which game these keys belong to. */
  gameTitle: string;
  /** Adds the "keyboard only" line, for games the games-repo build found no touch path in. */
  keyboardOnly?: boolean;
  onClose: () => void;
};

/**
 * The player's "How to play" card.
 *
 * It reads the catalog entry the app already holds — never the game. The frame is
 * sandboxed without `allow-same-origin`, so the parent cannot see inside it, and the
 * game's own in-shell controls popup is hidden on purpose by the player bridge
 * (`gamePlayer.ts` HIDE_CHROME) because the theater surfaces this chrome instead.
 */
export function HowToPlayPanel({ open, controls, gameTitle, keyboardOnly = false, onClose }: HowToPlayPanelProps) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Take focus while open and hand it back on close, the same contract GameTheater
  // keeps for the theater itself — otherwise focus is stranded on a hidden trigger
  // (the bar and the More menu each render one, and CSS hides whichever does not fit).
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  if (!open) return null;

  const rows = parseControls(controls);
  if (rows.length === 0) return null;

  // Portalled to the body: `.game-theater-bar` and `.theater-more-panel` carry a
  // backdrop-filter, which makes an ancestor the containing block for position:fixed
  // descendants and would clamp this card inside the bar (the bug AuthModal documents).
  return createPortal(
    <div className="howto-backdrop" onClick={onClose}>
      <div
        className="howto-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="howto-close"
          onClick={onClose}
          ref={closeRef}
          aria-label={t('player.howToPlayClose')}
        >
          <PixelIcon name="close" size={14} />
        </button>
        <h2 className="howto-title" id="howto-title">
          <PixelIcon name="gamepad" size={16} /> {t('player.howToPlay')}
        </h2>
        <p className="howto-game">{gameTitle}</p>
        <ul className="howto-list">
          {rows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
        {keyboardOnly ? <p className="howto-note">{t('catalog.keyboardOnlyTooltip')}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
