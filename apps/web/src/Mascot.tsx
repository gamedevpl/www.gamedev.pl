/**
 * Digitized gamedev.pl monster mascot.
 *
 * Idle is pixel-perfect: horizontal spans traced from `logo-gamedev.png` (70×60).
 * Other emotions start from the same silhouette with the face holes filled back in
 * (`MASCOT_SOLID_SPANS`), then punch new eyes/mouth via an SVG mask.
 *
 * Animation lives in layered SVG groups + CSS (bob, bounce, sway, blink lids,
 * waving arm). `staticPose` freezes everything; `prefers-reduced-motion` does too.
 */

import { useId, type ReactElement, type ReactNode } from 'react';
import { MASCOT_IDLE_SPANS, MASCOT_SOLID_SPANS } from './mascotSpans.js';

export type MascotEmotion =
  | 'idle'
  | 'happy'
  | 'curious'
  | 'thinking'
  | 'excited'
  | 'confused'
  | 'sad'
  | 'proud'
  | 'wave'
  | 'busy';

type MascotProps = {
  emotion?: MascotEmotion;
  size?: number;
  className?: string;
  title?: string;
  /** When true, all motion is forced off (e.g. tiny nav mark). */
  staticPose?: boolean;
};

function spansToRects(spans: ReadonlyArray<readonly [number, number, number]>, keyPrefix: string): ReactElement[] {
  return spans.map(([x, y, width], i) => <rect key={`${keyPrefix}-${i}`} x={x} y={y} width={width} height={1} />);
}

function eyeSlits(
  left: { cx: number; cy: number; rot: number; rx?: number; ry?: number },
  right: { cx: number; cy: number; rot: number; rx?: number; ry?: number },
): ReactElement {
  return (
    <g className="mascot__eyes">
      <ellipse
        className="mascot__eye mascot__eye--left"
        cx={left.cx}
        cy={left.cy}
        rx={left.rx ?? 2.2}
        ry={left.ry ?? 1.15}
        transform={`rotate(${left.rot} ${left.cx} ${left.cy})`}
      />
      <ellipse
        className="mascot__eye mascot__eye--right"
        cx={right.cx}
        cy={right.cy}
        rx={right.rx ?? 2.2}
        ry={right.ry ?? 1.15}
        transform={`rotate(${right.rot} ${right.cx} ${right.cy})`}
      />
    </g>
  );
}

function eyeDiscs(rx: number, ry: number, left: [number, number], right: [number, number]): ReactElement {
  return (
    <g className="mascot__eyes">
      <ellipse className="mascot__eye mascot__eye--left" cx={left[0]} cy={left[1]} rx={rx} ry={ry} />
      <ellipse className="mascot__eye mascot__eye--right" cx={right[0]} cy={right[1]} rx={rx} ry={ry} />
    </g>
  );
}

function eyeCrescents(): ReactElement {
  return (
    <g className="mascot__eyes" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round">
      <path className="mascot__eye mascot__eye--left" d="M31.5 5.8 A 3.1 2.3 0 0 1 37.2 5.8" />
      <path className="mascot__eye mascot__eye--right" d="M39.3 5.8 A 3.1 2.3 0 0 1 45 5.8" />
    </g>
  );
}

/** Logo-faithful idle mouth — kept for excited/wave which reopen a jagged maw. */
const MOUTH_JAGGED =
  'M18 11 L22 18 L26 10 L30 19 L35 9 L40 19 L44 10 L48 18 L52 11 L52 34 L48 27 L44 36 L40 26 L35 37 L30 27 L26 36 L22 28 L18 34 Z';
const MOUTH_WIDE =
  'M16 10 L21 19 L26 9 L31 20 L35 8 L39 20 L44 9 L49 19 L54 10 L54 36 L49 29 L44 38 L39 28 L35 39 L31 29 L26 38 L21 30 L16 36 Z';
const MOUTH_SMILE = 'M22 20 C27 33 43 33 48 20 C43 27 27 27 22 20 Z';
const MOUTH_PROUD = 'M24 22 C29 32 41 32 46 22 C41 28 29 28 24 22 Z';
const MOUTH_SAD = 'M24 28 C29 21 41 21 46 28 C41 25 29 25 24 28 Z';
const MOUTH_THINK =
  'M24 16 L28 22 L32 15 L36 23 L40 14 L44 22 L48 16 L48 30 L44 25 L40 32 L36 24 L32 31 L28 25 L24 30 Z';
const MOUTH_CONFUSED =
  'M18 15 C22 11 26 24 30 15 C34 9 38 24 42 15 C46 11 50 22 52 15 C50 28 46 26 42 32 C38 36 34 23 30 32 C26 36 22 23 18 30 Z';
const MOUTH_CURIOUS =
  'M20 13 L24 20 L28 12 L32 21 L36 11 L40 21 L44 12 L48 20 L52 13 L52 32 L48 26 L44 34 L40 25 L36 35 L32 26 L28 34 L24 27 L20 32 Z';
const MOUTH_BUSY =
  'M20 13 L25 20 L30 12 L35 21 L40 11 L45 21 L50 13 L50 32 L45 26 L40 34 L35 25 L30 33 L25 26 L20 31 Z';

function cutoutsFor(emotion: MascotEmotion): ReactElement | null {
  switch (emotion) {
    case 'idle':
      return null;
    case 'happy':
      return (
        <>
          {eyeDiscs(2.6, 2.8, [34, 5.5], [42, 5.5])}
          <path className="mascot__mouth" d={MOUTH_SMILE} />
        </>
      );
    case 'proud':
      return (
        <>
          {eyeCrescents()}
          <path className="mascot__mouth" d={MOUTH_PROUD} />
        </>
      );
    case 'curious':
      return (
        <>
          {eyeDiscs(2.3, 3.1, [33.5, 5], [43, 4.8])}
          <path className="mascot__mouth" d={MOUTH_CURIOUS} />
        </>
      );
    case 'thinking':
      return (
        <>
          {eyeSlits(
            { cx: 33.5, cy: 4.8, rot: -24, rx: 2.3, ry: 1.35 },
            { cx: 41.5, cy: 4.8, rot: -24, rx: 2.3, ry: 1.35 },
          )}
          <path className="mascot__mouth" d={MOUTH_THINK} />
        </>
      );
    case 'excited':
      return (
        <>
          {eyeDiscs(3.2, 3.6, [34, 5], [42, 5])}
          <path className="mascot__mouth" d={MOUTH_WIDE} />
        </>
      );
    case 'confused':
      return (
        <>
          {eyeSlits(
            { cx: 33, cy: 4.2, rot: -36, rx: 2.1, ry: 1.5 },
            { cx: 43, cy: 6.5, rot: 18, rx: 2.7, ry: 1.25 },
          )}
          <path className="mascot__mouth" d={MOUTH_CONFUSED} />
        </>
      );
    case 'sad':
      return (
        <>
          {eyeSlits(
            { cx: 34, cy: 6.2, rot: 22, rx: 2.3, ry: 1.1 },
            { cx: 42, cy: 6.2, rot: -22, rx: 2.3, ry: 1.1 },
          )}
          <path className="mascot__mouth" d={MOUTH_SAD} />
        </>
      );
    case 'wave':
      return (
        <>
          {eyeDiscs(2.7, 2.9, [34, 5.5], [42, 5.5])}
          <path className="mascot__mouth" d={MOUTH_JAGGED} />
        </>
      );
    case 'busy':
      return (
        <>
          {eyeDiscs(2.3, 2.9, [34, 5.5], [42, 5.5])}
          <path className="mascot__mouth" d={MOUTH_BUSY} />
        </>
      );
    default:
      return null;
  }
}

/** Lids that cover the eye holes during a blink — works on the pixel idle body too. */
function BlinkLids() {
  return (
    <g className="mascot__lids" fill="currentColor" aria-hidden="true">
      <rect className="mascot__lid mascot__lid--left" x="29" y="3" width="5" height="5" rx="1.2" />
      <rect className="mascot__lid mascot__lid--right" x="38" y="3" width="5" height="5" rx="1.2" />
    </g>
  );
}

export function Mascot({
  emotion = 'idle',
  size = 48,
  className,
  title,
  staticPose = false,
}: MascotProps) {
  const reactId = useId().replace(/:/g, '');
  const maskId = `mascot-mask-${reactId}`;
  const height = Math.round((size * 60) / 70);
  const classes = ['mascot', `mascot--${emotion}`, staticPose ? 'mascot--static' : null, className]
    .filter(Boolean)
    .join(' ');
  const cutouts = cutoutsFor(emotion);
  const isIdle = emotion === 'idle' || cutouts == null;
  const showWaveArm = emotion === 'wave' || emotion === 'excited';

  return (
    <svg
      className={classes}
      width={size}
      height={height}
      viewBox="0 0 70 60"
      shapeRendering={isIdle ? 'crispEdges' : 'auto'}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}

      <g className="mascot__body-group">
        {isIdle ? (
          <g className="mascot__pixels" fill="currentColor">
            {spansToRects(MASCOT_IDLE_SPANS, 'idle')}
          </g>
        ) : (
          <>
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="70" height="60">
                <g fill="#fff">{spansToRects(MASCOT_SOLID_SPANS, 'solid')}</g>
                <g fill="#000">{cutouts}</g>
              </mask>
            </defs>
            <rect
              className="mascot__face"
              x="0"
              y="0"
              width="70"
              height="60"
              fill="currentColor"
              mask={`url(#${maskId})`}
            />
          </>
        )}

        <BlinkLids />

        {showWaveArm ? (
          <g
            className="mascot__wave-arm"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M64 36 Q70 26 67 14" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}

type MascotMomentProps = {
  emotion?: MascotEmotion;
  size?: number;
  className?: string;
  title?: string;
  children?: ReactNode;
};

/** Mascot + optional caption for empty / error / loading moments. */
export function MascotMoment({
  emotion = 'idle',
  size = 64,
  className,
  title,
  children,
}: MascotMomentProps) {
  return (
    <div className={['mascot-moment', className].filter(Boolean).join(' ')}>
      <Mascot emotion={emotion} size={size} title={title} />
      {children ? <div className="mascot-moment__copy">{children}</div> : null}
    </div>
  );
}
