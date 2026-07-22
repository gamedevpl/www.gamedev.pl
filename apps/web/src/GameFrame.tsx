type GameFrameProps = { title: string; html: string; src?: never } | { title: string; src: string; html?: never };

/**
 * Runs a generated game inside a sandboxed iframe. `allow-scripts` with NO
 * `allow-same-origin` puts the code in an opaque origin — it can't reach this
 * app's DOM, storage, or cookies. That isolation is the safety boundary for
 * arbitrary generated code (the same model itch.io / CodePen use).
 */
export function GameFrame(props: GameFrameProps) {
  return (
    <iframe
      className="game-frame"
      title={props.title}
      sandbox="allow-scripts"
      src={props.src}
      srcDoc={props.html}
      width={480}
      height={640}
    />
  );
}
