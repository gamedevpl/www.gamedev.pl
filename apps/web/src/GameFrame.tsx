interface GameFrameProps {
  title: string;
  html: string;
}

/**
 * Runs a generated game inside a sandboxed iframe. `allow-scripts` with NO
 * `allow-same-origin` puts the code in an opaque origin — it can't reach this
 * app's DOM, storage, or cookies. That isolation is the safety boundary for
 * arbitrary generated code (the same model itch.io / CodePen use).
 */
export function GameFrame({ title, html }: GameFrameProps) {
  return <iframe className="game-frame" title={title} sandbox="allow-scripts" srcDoc={html} width={480} height={640} />;
}
