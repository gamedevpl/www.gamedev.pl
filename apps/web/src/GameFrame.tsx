import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import i18n from './i18n/index.js';
import { embedGameHtml, withGameLocale } from './gamePlayer.js';

type GameFrameSource = { title: string; html: string; src?: never } | { title: string; src: string; html?: never };

/**
 * `frameRef` lets a multiplayer host reach this iframe's contentWindow to relay
 * controller input over postMessage. Single-player callers omit it and nothing
 * about the frame changes — the sandbox attribute is identical either way.
 */
type GameFrameProps = GameFrameSource & {
  frameRef?: MutableRefObject<HTMLIFrameElement | null>;
  // When shown in the app's game player, inject the bridge that hides the game's
  // own title/description/sound chrome and relays sound control to the header.
  embed?: boolean;
};

/**
 * Runs a generated game inside a sandboxed iframe. `allow-scripts` with NO
 * `allow-same-origin` puts the code in an opaque origin — it can't reach this
 * app's DOM, storage, or cookies. That isolation is the safety boundary for
 * arbitrary generated code (the same model itch.io / CodePen use).
 *
 * `allow-pointer-lock` is additive and does not weaken the opaque-origin
 * boundary: scene3d FPS games may request mouse-look after a user gesture.
 *
 * `allow="accelerometer; gyroscope; magnetometer"` delegates Permissions-Policy
 * so opt-in GameKit `motion` (phone tilt) can receive DeviceOrientation /
 * DeviceMotion inside the opaque-origin frame. Sensors stay optional for every
 * game; keyboard / pad remain enough to finish.
 */
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
    if (props.embed) srcDoc = embedGameHtml(srcDoc);
  }

  // Hand keyboard focus to the game so arrow keys / WASD work without a click first.
  const focusGame = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    frame.focus();
    // Focusing the element is not enough on its own: the focus has to land *inside*
    // the game's document, and a document that commits after we focused the element
    // takes it back. `focus()` is one of the few methods callable across an opaque
    // origin, so this works under sandbox="allow-scripts allow-pointer-lock".
    frame.contentWindow?.focus();
  }, [iframeRef]);

  useEffect(() => {
    // Backstop for the cases the load event doesn't cover — a document that had
    // already loaded before this effect ran, or a re-render that swaps srcDoc.
    const timer = setTimeout(focusGame, 100);
    return () => clearTimeout(timer);
  }, [props.html, props.src, focusGame]);

  return (
    <iframe
      ref={iframeRef}
      className="game-frame"
      title={props.title}
      sandbox="allow-scripts allow-pointer-lock"
      allow="accelerometer; gyroscope; magnetometer"
      src={props.src}
      srcDoc={srcDoc}
      // The load event is the reliable moment to focus: the game's document exists
      // and won't be replaced out from under the focus we just set.
      onLoad={focusGame}
      // Parent-side backstop for the iOS callout when the long-press hits the iframe
      // chrome rather than a node inside the opaque-origin document.
      onContextMenu={(event) => event.preventDefault()}
      tabIndex={0}
      width="100%"
      height="100%"
    />
  );
}
