import { useEffect, useRef } from 'react';

type GameFrameProps = { title: string; html: string; src?: never } | { title: string; src: string; html?: never };

/**
 * Runs a generated game inside a sandboxed iframe. `allow-scripts` with NO
 * `allow-same-origin` puts the code in an opaque origin — it can't reach this
 * app's DOM, storage, or cookies. That isolation is the safety boundary for
 * arbitrary generated code (the same model itch.io / CodePen use).
 */
export function GameFrame(props: GameFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Automatically focus the iframe so arrow keys / WASD controls work immediately
    const timer = setTimeout(() => {
      iframeRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [props.html, props.src]);

  return (
    <iframe
      ref={iframeRef}
      className="game-frame"
      title={props.title}
      sandbox="allow-scripts"
      src={props.src}
      srcDoc={props.html}
      tabIndex={0}
      width="100%"
      height="100%"
    />
  );
}
