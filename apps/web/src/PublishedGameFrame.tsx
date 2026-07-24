import { useEffect, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame';
import { fetchPublishedGame } from './catalog';

type PublishedGameFrameProps = {
  slug: string;
  title: string;
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  embed?: boolean;
};

/**
 * Fetches a published game's assembled document from our API and runs it in the
 * sandboxed GameFrame. Published games are served through the app (not public
 * GitHub Pages), so this works even when the games repo is private.
 */
export function PublishedGameFrame({ slug, title, frameRef, embed }: PublishedGameFrameProps) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [gameTitle, setGameTitle] = useState<string>(title);

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
  }, [slug, title]);

  if (failed) {
    return <p className="error">{t('catalog.gameLoadError')}</p>;
  }
  if (html === null) {
    return <p className="catalog-state">{t('catalog.gameLoading')}</p>;
  }
  return <GameFrame title={gameTitle} html={html} frameRef={frameRef} embed={embed} />;
}
