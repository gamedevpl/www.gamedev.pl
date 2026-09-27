import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import i18n from './i18n/index.js';
import { prepareGameFrameDocument, useHostLoadTracking } from './frameMessage.js';
import { embedGameHtml, withGameLocale } from './gamePlayer.js';
import { withFrameDocument } from './frameBootstrap.js';

type GameFrameSource = { title: string; html: string; src?: never } | { title: string; src: string; html?: never };

type GameFrameProps = GameFrameSource & {
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  // When shown in the app's game player, inject the bridge that hides the game's
  // own title/description/sound chrome and relays sound control to the header.
  embed?: boolean;
  autoFocus?: boolean;
  // Agent executor, served to reviewers only; absent means no mode.
  agentBridge?: string | null;
};

export function GameFrame(props: GameFrameProps) {
  const localRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = props.frameRef ?? localRef;
  // Localize the game to the app's current language (rewrites <html lang>), then —
  // only in the app's player — inject the chrome-hiding bridge. Locale applies to
  // every game regardless of embed; the bridge is player-only. `i18n.language` is
  // read at render, and hosts re-render on language change so this stays current.
  let srcDoc = props.html ?? undefined;
  if (srcDoc != null) {
    srcDoc = withGameLocale(srcDoc, i18n.language);
    if (props.embed) srcDoc = embedGameHtml(srcDoc, props.agentBridge);
  }
  const prepared = useMemo(() => {
    const nonce = crypto.randomUUID();
    return { nonce, html: srcDoc === undefined ? undefined : withFrameDocument(srcDoc, nonce) };
  }, [srcDoc]);
  useLayoutEffect(() => {
    const frame = iframeRef.current;
    if (frame && prepared.html !== undefined) return prepareGameFrameDocument(frame, prepared.nonce);
  }, [iframeRef, prepared]);

  const autoFocus = props.autoFocus ?? true;

  // Hand keyboard focus to the game so arrow keys / WASD work without a click first.
  const focusGame = useCallback(() => {
    if (!autoFocus) return;
    const frame = iframeRef.current;
    if (!frame) return;
    frame.focus();
    // Focus the committed document as well as its iframe element.
    frame.contentWindow?.focus();
  }, [iframeRef, autoFocus]);

  const { onLoad, frameKey } = useHostLoadTracking(iframeRef, srcDoc ?? props.src, focusGame);

  useEffect(() => {
    // Backstop for the cases the load event doesn't cover — a document that had
    // already loaded before this effect ran, or a re-render that swaps srcDoc.
    const timer = setTimeout(focusGame, 100);
    return () => clearTimeout(timer);
  }, [props.html, props.src, focusGame]);

  return (
    // Opaque origins prevent games from reaching host cookies and storage.
    <iframe
      key={frameKey}
      ref={iframeRef}
      className="game-frame"
      title={props.title}
      sandbox="allow-scripts allow-pointer-lock"
      src={props.src}
      srcDoc={prepared.html}
      // Focuses the game, and flags a document the game navigated to itself.
      onLoad={onLoad}
      // Parent-side backstop for the iOS callout when the long-press hits the iframe
      // chrome rather than a node inside the opaque-origin document.
      onContextMenu={(event) => event.preventDefault()}
      tabIndex={autoFocus ? 0 : -1}
      width="100%"
      height="100%"
    />
  );
}
