import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { parseControls } from './howToPlay.js';

type HowToPlayPanelProps = {
  open: boolean;
  /** The game's `controls` string from the catalog. Free text; rendered as text nodes. */
  controls: string;
  /**
   * Names the game in the close button's accessible label. It is not shown: the theater
   * bar behind the card already carries the title, and repeating it in a card this small
   * costs a row without answering the question the card exists for.
   */
  gameTitle: string;
  /** Adds the "keyboard only" line, for games the games-repo build found no touch path in. */
  keyboardOnly?: boolean;
  onClose: () => void;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Take focus while open. Focus is NOT restored here: the caller hands it back to the
  // game, because returning it to the trigger leaves the next Space press hitting a
  // button instead of firing in the game.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  // `aria-modal` tells a screen reader the rest of the page is inert; it does nothing to
  // Tab. Without this, tabbing walks out of the card and into the page chrome behind a
  // game that is still running, with no way to see where focus went.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !cardRef.current) return;
      const stops = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (stops.length === 0) return;
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !cardRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
        ref={cardRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="howto-head">
          <h2 className="howto-title" id="howto-title">
            {t('player.howToPlay')}
          </h2>
          <button
            type="button"
            className="howto-close"
            onClick={onClose}
            ref={closeRef}
            aria-label={t('player.howToPlayClose', { game: gameTitle })}
          >
            <PixelIcon name="close" size={14} />
          </button>
        </div>
        <dl className="howto-keys">
          {rows.map((row, index) => (
            // Keyed by index on purpose: a controls string may repeat a clause, and two
            // long clauses can truncate to the same text, so the row text is not unique.
            <div className={row.keys ? 'howto-row' : 'howto-row is-wide'} key={index}>
              {row.keys ? <dt>{row.keys}</dt> : null}
              <dd>{row.action}</dd>
            </div>
          ))}
        </dl>
        {keyboardOnly ? <p className="howto-note">{t('catalog.keyboardOnlyTooltip')}</p> : null}
        <p className="howto-dismiss">{t('player.howToPlayDismiss')}</p>
      </div>
    </div>,
    document.body,
  );
}
