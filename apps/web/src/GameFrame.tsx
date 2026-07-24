import { useEffect, useRef, type MutableRefObject } from 'react';
import i18n from './i18n';
import { embedGameHtml, withGameLocale } from './gamePlayer';

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

  useEffect(() => {
    // Automatically focus the iframe so arrow keys / WASD controls work immediately
    const timer = setTimeout(() => {
      iframeRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [props.html, props.src, iframeRef]);

  return (
    <iframe
      ref={iframeRef}
      className="game-frame"
      title={props.title}
      sandbox="allow-scripts"
      src={props.src}
      srcDoc={srcDoc}
      tabIndex={0}
      width="100%"
      height="100%"
    />
  );
}
