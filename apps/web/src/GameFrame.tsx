import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import i18n from './i18n/index.js';
import { prepareGameFrameDocument, useHostLoadTracking } from './frameMessage.js';
import { embedGameHtml, withGameLocale } from './gamePlayer.js';
import { usePreparedFrameDocument } from './frameAdapter.js';

type GameFrameSource = { title: string; html: string; src?: never } | { title: string; src: string; html?: never };

type GameFrameProps = GameFrameSource & {
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  // Player only: hide the game's own chrome and relay its sound.
  embed?: boolean;
  // False: never steal focus, and leave the tab order.
  autoFocus?: boolean;
  // Agent executor, served to reviewers only; absent means no mode.
  agentBridge?: string | null;
};

export function GameFrame(props: GameFrameProps) {
  const localRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = props.frameRef ?? localRef;
  // Locale applies to every game; hosts re-render on language change.
  let srcDoc = props.html ?? undefined;
  if (srcDoc != null) {
    srcDoc = withGameLocale(srcDoc, i18n.language);
    if (props.embed) srcDoc = embedGameHtml(srcDoc, props.agentBridge);
  }
  const prepared = usePreparedFrameDocument(srcDoc);
  const shownSource = prepared.source;
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
    // A later commit steals focus; opaque windows still accept `focus()`.
    frame.contentWindow?.focus();
  }, [iframeRef, autoFocus]);

  const { onLoad, frameKey } = useHostLoadTracking(iframeRef, shownSource ?? props.src, focusGame);

  useEffect(() => {
    // Backstop for the cases the load event doesn't cover — a document that had
    // already loaded before this effect ran, or a re-render that swaps srcDoc.
    const timer = setTimeout(focusGame, 100);
    return () => clearTimeout(timer);
  }, [shownSource, props.src, focusGame]);

  // No iframe before its first document: a blank load would count as navigation.
  if (props.src === undefined && prepared.html === undefined) return null;
  return (
    <iframe
      key={frameKey}
      ref={iframeRef}
      className="game-frame"
      title={props.title}
      // Never add allow-same-origin or an allow list: docs/security-model.md.
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
