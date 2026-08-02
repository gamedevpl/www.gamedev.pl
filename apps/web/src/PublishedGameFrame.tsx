import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { GameFrame } from './GameFrame.js';
import { fetchPublishedGame } from './catalog.js';
import { PixelIcon } from './PixelIcon.js';
import { useGameTelemetry } from './gamePlayer.js';
import { rememberRecentPlay } from './recentPlays.js';
import { recordGamePlayed } from './recommendationsApi.js';
import { AuthModal } from './AuthModal.js';
import { useAuth } from './AuthContext.js';
import { RemixPanel } from './RemixPanel.js';
import { readSharedParams } from './remixApi.js';

type PublishedGameFrameProps = {
  slug: string;
  title: string;
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  embed?: boolean;
  /** Connected controller slots, when this game was opened as a party session. */
  slots?: number;
  /**
   * Whether this surface offers Remix. Off for party mode and embeds, where the
   * frame is not the player's alone to bend.
   */
  remixable?: boolean;
};

/**
 * Fetches a published game's assembled document from our API and runs it in the
 * sandboxed GameFrame. Published games are served through the app (not public
 * GitHub Pages), so this works even when the games repo is private.
 */
export function PublishedGameFrame({ slug, title, frameRef, embed, slots, remixable }: PublishedGameFrameProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [gameTitle, setGameTitle] = useState<string>(title);
  // Bumped by the Retry control so a failed fetch can be re-attempted without
  // leaving the theater (which would otherwise be the only way to try again).
  const [loadAttempt, setLoadAttempt] = useState(0);
  /**
   * A remix swaps the whole document — the only way new code can enter an
   * opaque-origin, eval-free frame. Held apart from the fetched html so closing
   * the remix returns the player to the published game rather than to a reload.
   */
  const [remixHtml, setRemixHtml] = useState<string | null>(null);
  const [remixOpen, setRemixOpen] = useState(false);
  const [remixAuthOpen, setRemixAuthOpen] = useState(false);
  const localFrameRef = useRef<HTMLIFrameElement | null>(null);
  const activeFrameRef = frameRef ?? localFrameRef;
  // Present only when the player arrived on a shared link; read once.
  const [sharedParams] = useState(() => readSharedParams(window.location.search));

  // Starts only once the document is in hand, so a session means "a game was handed
  // to a player" rather than "a card was clicked". A fetch that never resolves is a
  // catalog problem, and this is not the place that would report it.
  useGameTelemetry(slug, html !== null, slots);

  // Account play affinity (signed-in) + device-local recent list (everyone). Both are
  // best-effort and separate from anonymous play telemetry — see docs/recommendations.md.
  useEffect(() => {
    if (html === null) return;
    rememberRecentPlay(slug);
    recordGamePlayed(slug);
  }, [slug, html]);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    setGameTitle(title);
    setRemixHtml(null);

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
  // `embed` describes chrome, not ownership — the theater always embeds — so the
  // gate is the explicit prop plus "this frame is one player's", which a party
  // session (slots) is not.
  const showRemix = Boolean(remixable) && slots === undefined;
  const frame = <GameFrame title={gameTitle} html={remixHtml ?? html} frameRef={activeFrameRef} embed={embed} />;
  if (!showRemix) return frame;

  return (
    <div className="remix-host">
      {frame}
      {/*
       * Signed-in only for now (owner decision): a remix spends model calls on
       * someone's behalf, and a session is what makes that attributable during
       * the beta.
       *
       * That includes arriving on a shared link. The values are harmless on
       * their own, but the panel is what applies them and the panel needs a
       * session to exist — so a signed-out visitor gets the game as published
       * plus a sign-in prompt, rather than a link that silently does nothing.
       * Applying shared values without an account would need an ungated way to
       * read a game's declaration, which is a surface worth adding on purpose
       * rather than as a side effect of this gate.
       */}
      {user && (remixOpen || sharedParams) ? (
        <RemixPanel
          slug={slug}
          frameRef={activeFrameRef}
          initialParams={sharedParams}
          onSwapDocument={setRemixHtml}
          onClose={() => setRemixOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="remix-open"
          title={user ? t('remix.button') : t('remix.signInToRemix')}
          onClick={() => (user ? setRemixOpen(true) : setRemixAuthOpen(true))}
        >
          <PixelIcon name="wrench" size={13} /> {user ? t('remix.button') : t('remix.signInToRemix')}
        </button>
      )}
      <AuthModal
        isOpen={remixAuthOpen}
        onClose={() => setRemixAuthOpen(false)}
        title={t('remix.signInTitle')}
        subtitle={t('remix.signInSubtitle')}
      />
    </div>
  );
}
