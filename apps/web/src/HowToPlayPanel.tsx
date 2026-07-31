import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { CatalogTouch } from './catalog.js';
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
  /**
   * Catalog touch support, derived by the games-repo build from the game's own source —
   * never authored in a spec — so it can be stated as fact. `gamekit` earns a Touch row;
   * `none` earns the keyboard-only line.
   */
  touch?: CatalogTouch | null;
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
export function HowToPlayPanel({ open, controls, gameTitle, touch = null, onClose }: HowToPlayPanelProps) {
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
      // The "outside the card" case has to be handled in both directions. Clicking the
      // card's own non-focusable text (a `dt`, the title) leaves `activeElement` on
      // `body`, and a forward Tab from there used to match neither branch and walk into
      // the chrome behind a running game.
      const outside = !cardRef.current.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
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
              {/* A clause with no key/action shape still gets a term, hidden visually but
                  read aloud: a `dl` group that is a definition with nothing being defined
                  is invalid, and a screen reader announces it orphaned. */}
              <dt>{row.keys || t('player.howToPlayOther')}</dt>
              <dd>{row.action}</dd>
            </div>
          ))}
          {/* Stated, not guessed: `touch` is derived from the game's own source by the
              games-repo build, so a pad promised here is a pad that exists. */}
          {touch === 'gamekit' ? (
            <div className="howto-row">
              <dt>{t('player.howToPlayTouch')}</dt>
              <dd>{t('player.howToPlayTouchPad')}</dd>
            </div>
          ) : null}
        </dl>
        {touch === 'none' ? <p className="howto-note">{t('catalog.keyboardOnlyTooltip')}</p> : null}
        <p className="howto-dismiss">{t('player.howToPlayDismiss')}</p>
      </div>
    </div>,
    document.body,
  );
}
