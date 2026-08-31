import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { GameFrame } from './GameFrame.js';
import { fetchPublishedGame } from './catalog.js';
import { PixelIcon } from './PixelIcon.js';
import { useGameTelemetry } from './gamePlayer.js';
import { rememberRecentPlay } from './recentPlays.js';
import { recordGamePlayed } from './recommendationsApi.js';
import { RemixPanel, type RemixEditorStage } from './RemixPanel.js';
import type { RemixSession } from './remixApi.js';
import { readSharedParams } from './remixApi.js';
import { resumeRemixForSlug, sessionFromResume } from './remixSessionPersist.js';
import type { PlayVia } from './visitTelemetry.js';

type PublishedGameFrameProps = {
  slug: string;
  title: string;
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  embed?: boolean;
  /** Connected controller slots, when this game was opened as a party session. */
  slots?: number;
  // Which home page surface launched this play, if it did.
  via?: PlayVia;
  /**
   * Whether this frame is currently on screen. The game page keeps it mounted behind
   * another tab so a run is not restarted; play time must not accrue while it is
   * hidden. Defaults true — every other caller shows the frame it mounts.
   */
  active?: boolean;
  // Off on review desk so editorial play does not skew telemetry.
  trackPlay?: boolean;
  /**
   * Whether this surface offers Remix. Off for party mode and embeds, where the
   * frame is not the player's alone to bend.
   */
  remixable?: boolean;
  /**
   * The theater's More-menu doors, as nonces so a re-chosen entry re-opens what
   * the player closed. `remixOpenNonce` opens the remix sheet; `painterNonce`
   * opens it with the level painter showing. The pause-moment invitation below
   * is untouched by either — these add doors, they do not move the invitation.
   */
  remixOpenNonce?: number;
  /** A landing-page request to start after the remix session is ready. */
  initialRemixRequest?: string;
  painterNonce?: number;
  /** Reports whether this game's remix has a painter, for the menu to show its entry. */
  onRemixCapabilities?: (caps: { painter: boolean }) => void;
  // Hidden theater HUD docks remix instead of covering play.
  theaterChromeHidden?: boolean;
  // Expanding the dock should bring theater chrome back.
  onRevealChrome?: () => void;
};

/**
 * Fetches a published game's assembled document from our API and runs it in the
 * sandboxed GameFrame. Published games are served through the app (not public
 * GitHub Pages), so this works even when the games repo is private.
 */
export function PublishedGameFrame({
  slug,
  title,
  frameRef,
  embed,
  slots,
  via,
  active = true,
  trackPlay = true,
  remixable,
  remixOpenNonce,
  initialRemixRequest,
  painterNonce,
  onRemixCapabilities,
  theaterChromeHidden,
  onRevealChrome,
}: PublishedGameFrameProps) {
  const { t } = useTranslation();
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
  /**
   * The remix session, held above the panel so closing the sheet does not end it.
   *
   * The panel unmounts on Close while the remixed document keeps running, so a
   * session owned by the panel meant the most natural sequence there is — change
   * something, close the sheet to play it, find it broken, reopen — came back to
   * a fresh session with no history and no way back. The session outlives the
   * sheet because the *change* does.
   */
  const [remixSession, setRemixSession] = useState<RemixSession | null>(null);
  const [remixUndoable, setRemixUndoable] = useState(false);
  const [remixOpen, setRemixOpen] = useState(false);
  // The landing-page request is a one-shot handoff. Keep consumption above the
  // panel because closing the sheet unmounts it; leaving the request on props
  // would replay the same (potentially paid) change when the player reopened it.
  const [pendingInitialRemixRequest, setPendingInitialRemixRequest] = useState(initialRemixRequest ?? null);
  /**
   * Level-editor stage: the painter leaves the remix sheet and owns the theater.
   * Focus flips Edit ↔ Play without unmounting the iframe or the painter — the
   * host only restyles which surface is full-bleed vs bottom-right PiP.
   */
  const [editorStage, setEditorStage] = useState<RemixEditorStage>({ active: false, focus: 'edit' });
  const [restoreReady, setRestoreReady] = useState(false);
  const localFrameRef = useRef<HTMLIFrameElement | null>(null);
  const activeFrameRef = frameRef ?? localFrameRef;
  // Present only when the player arrived on a shared link; read once.
  const [sharedParams] = useState(() => readSharedParams(window.location.search));

  // Starts only once the document is in hand, so a session means "a game was handed
  // to a player" rather than "a card was clicked". A fetch that never resolves is a
  // catalog problem, and this is not the place that would report it.
  useGameTelemetry(slug, trackPlay && html !== null, slots, active, via);

  // Account play affinity (signed-in) + device-local recent list (everyone). Both are
  // best-effort and separate from anonymous play telemetry — see docs/recommendations.md.
  useEffect(() => {
    if (!trackPlay || html === null) return;
    rememberRecentPlay(slug);
    recordGamePlayed(slug);
  }, [slug, html, trackPlay]);

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

  useEffect(() => {
    let cancelled = false;
    setRestoreReady(false);
    const show = Boolean(remixable) && slots === undefined;
    if (!show) {
      setRestoreReady(true);
      return;
    }
    void resumeRemixForSlug(slug).then((resumed) => {
      if (cancelled) return;
      if (resumed) {
        setRemixSession(sessionFromResume(resumed.live));
        if (resumed.live.html) setRemixHtml(resumed.live.html);
        setRemixUndoable(Boolean(resumed.live.undoable));
        setRemixOpen(resumed.snapshot.remixOpen);
        onRemixCapabilities?.({ painter: Boolean(resumed.live.content || resumed.live.layers) });
      }
      setRestoreReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callback is stable
  }, [slug, remixable, slots]);

  // Either menu door opens the sheet; the painter door additionally tells the
  // panel to show the brush (it carries the nonce through as `painterRequest`).
  useEffect(() => {
    if ((remixOpenNonce ?? 0) > 0 || (painterNonce ?? 0) > 0) setRemixOpen(true);
  }, [remixOpenNonce, painterNonce]);

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
    return <AppLoadingScreen />;
  }
  // `embed` describes chrome, not ownership — the theater always embeds — so the
  // gate is the explicit prop plus "this frame is one player's", which a party
  // session (slots) is not.
  const showRemix = Boolean(remixable) && slots === undefined;
  const frame = <GameFrame title={gameTitle} html={remixHtml ?? html} frameRef={activeFrameRef} embed={embed} />;
  if (!showRemix) return frame;

  const hostClass = [
    'remix-host',
    editorStage.active ? 'is-editor-stage' : '',
    editorStage.active ? `is-focus-${editorStage.focus}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={hostClass}>
      {/*
       * Slot wrapper is `display: contents` while the sheet is up so the iframe
       * still fills the theater; editor-stage CSS turns it into the PiP/full
       * surface without remounting the frame.
       */}
      <div className="remix-game-slot">{frame}</div>
      {restoreReady && (remixOpen || sharedParams) ? (
        <RemixPanel
          slug={slug}
          frameRef={activeFrameRef}
          initialParams={sharedParams}
          initialRequest={pendingInitialRemixRequest}
          onInitialRequestConsumed={() => setPendingInitialRemixRequest(null)}
          onSwapDocument={setRemixHtml}
          session={remixSession}
          onSession={setRemixSession}
          undoable={remixUndoable}
          onUndoable={setRemixUndoable}
          onClose={() => setRemixOpen(false)}
          painterRequest={painterNonce}
          onCapabilities={onRemixCapabilities}
          onEditorStage={setEditorStage}
          theaterChromeHidden={theaterChromeHidden}
          onRevealChrome={onRevealChrome}
        />
      ) : null}
    </div>
  );
}
