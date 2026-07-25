import { useEffect, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame';
import { fetchPublishedGame } from './catalog';
import { PixelIcon } from './PixelIcon';
import { useGameTelemetry } from './gamePlayer';

type PublishedGameFrameProps = {
  slug: string;
  title: string;
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  embed?: boolean;
  /** Connected controller slots, when this game was opened as a party session. */
  slots?: number;
};

/**
 * Fetches a published game's assembled document from our API and runs it in the
 * sandboxed GameFrame. Published games are served through the app (not public
 * GitHub Pages), so this works even when the games repo is private.
 */
export function PublishedGameFrame({ slug, title, frameRef, embed, slots }: PublishedGameFrameProps) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [gameTitle, setGameTitle] = useState<string>(title);
  // Bumped by the Retry control so a failed fetch can be re-attempted without
  // leaving the theater (which would otherwise be the only way to try again).
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Starts only once the document is in hand, so a session means "a game was handed
  // to a player" rather than "a card was clicked". A fetch that never resolves is a
  // catalog problem, and this is not the place that would report it.
  useGameTelemetry(slug, html !== null, slots);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    setGameTitle(title);

    fetchPublishedGame(slug)
      .then((game) => {
        if (!cancelled) {
          setHtml(game.html);
          if (game.title) setGameTitle(game.title);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, title, loadAttempt]);

  if (failed) {
    return (
      <div className="load-error" role="alert">
        <p className="error">{t('catalog.gameLoadError')}</p>
        <button type="button" className="secondary-btn" onClick={() => setLoadAttempt((n) => n + 1)}>
          <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
        </button>
      </div>
    );
  }
  if (html === null) {
    return <p className="catalog-state">{t('catalog.gameLoading')}</p>;
  }
  return <GameFrame title={gameTitle} html={html} frameRef={frameRef} embed={embed} />;
}
