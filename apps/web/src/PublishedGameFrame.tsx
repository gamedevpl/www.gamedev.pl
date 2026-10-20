import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame.js';
import { GameLoadScreen } from './GameLoadScreen.js';
import type { PublishedGame } from './catalog.js';
import { usePublishedGameFetch } from './usePublishedGameFetch.js';
import { PixelIcon } from './PixelIcon.js';
import { useGameTelemetry } from './gamePlayer.js';
import { rememberRecentPlay } from './recentPlays.js';
import { recordGamePlayed } from './recommendationsApi.js';
import type { PlayVia } from './visitTelemetry.js';

type PublishedGameFrameProps = {
  slug: string;
  reviewVersion?: string;
  loadedGame?: PublishedGame;
  title: string;
  agentBridge?: string | null;
  // True only while the executor answer is still in flight.
  agentBridgePending?: boolean;
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  embed?: boolean;
  /** Connected controller slots, when this game was opened as a party session. */
  slots?: number;
  // Which home page surface launched this play, if it did.
  via?: PlayVia;
  // Hidden mounted frames must not accrue play time.
  active?: boolean;
  agentMode?: boolean;
};

/**
 * Fetches a published game's assembled document from our API and runs it in the
 * sandboxed GameFrame. Published games are served through the app (not public
 * GitHub Pages), so this works even when the games repo is private.
 */
export function PublishedGameFrame({
  slug,
  reviewVersion,
  loadedGame,
  title,
  frameRef,
  embed,
  slots,
  via,
  active = true,
  agentMode = false,
  agentBridge,
  agentBridgePending,
}: PublishedGameFrameProps) {
  const { t } = useTranslation();
  const [gameTitle, setGameTitle] = useState<string>(title);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { game, progress, error } = usePublishedGameFetch(
    slug,
    loadAttempt,
    reviewVersion,
    loadAttempt === 0 ? loadedGame : undefined,
  );
  const html = game?.html ?? null;
  const localFrameRef = useRef<HTMLIFrameElement | null>(null);
  const activeFrameRef = frameRef ?? localFrameRef;

  // Open only when a published document is available.
  useGameTelemetry(slug, activeFrameRef, html !== null, slots, active, via, game?.artifactVersion, agentMode);

  useEffect(() => {
    if (html === null || reviewVersion !== undefined) return;
    rememberRecentPlay(slug);
    recordGamePlayed(slug);
  }, [slug, html, reviewVersion]);

  useEffect(() => {
    setGameTitle(title);
  }, [slug, title, loadAttempt]);

  useEffect(() => {
    if (game?.title) setGameTitle(game.title);
  }, [game]);

  if (error) {
    return (
      <div className="load-error" role="alert">
        <p className="error">{t('catalog.gameLoadError')}</p>
        <button type="button" className="secondary-btn" onClick={() => setLoadAttempt((n) => n + 1)}>
          <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
        </button>
      </div>
    );
  }
  // The bridge answer is part of the document; mounting early navigates twice.
  if (html === null || agentBridgePending) {
    return <GameLoadScreen progress={progress} />;
  }
  return <GameFrame title={gameTitle} html={html} frameRef={activeFrameRef} embed={embed} agentBridge={agentBridge} />;
}
