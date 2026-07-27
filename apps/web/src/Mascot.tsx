/**
 * Digitized gamedev.pl monster mascot — the turquoise logo creature, as a layered
 * SVG so it can change expression and gesture.
 *
 * Geometry matches `logo-gamedev.png` (rounded body, donut ears, jagged mouth,
 * stick arms, block legs). Eyes/mouth/ear-holes are real mask cutouts so the
 * creature sits cleanly on any background. Emotions swap those cutouts and the
 * arm paths; CSS classes add blink, bob, bounce, and wave. Respects
 * `prefers-reduced-motion`.
 */

import { useId, type ReactElement, type ReactNode } from 'react';

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
  /** When true, idle blink / bob animations are forced off (e.g. tiny nav mark). */
  staticPose?: boolean;
};

type FaceParts = {
  /** Shapes drawn black inside the mask to punch holes. */
  cutouts: ReactElement;
  leftArm: string;
  rightArm: string;
};

function eyeSlits(leftRot: number, rightRot: number, cy = 20, rx = 2.4, ry = 1.35): ReactElement {
  return (
    <g className="mascot__eyes">
      <ellipse
        className="mascot__eye mascot__eye--left"
        cx="27"
        cy={cy}
        rx={rx}
        ry={ry}
        transform={`rotate(${leftRot} 27 ${cy})`}
      />
      <ellipse
        className="mascot__eye mascot__eye--right"
        cx="43"
        cy={cy}
        rx={rx}
        ry={ry}
        transform={`rotate(${rightRot} 43 ${cy})`}
      />
    </g>
  );
}

function eyeDiscs(
  size: { rx: number; ry: number } = { rx: 3.2, ry: 3.4 },
  left: { cx: number; cy: number } = { cx: 27, cy: 20 },
  right: { cx: number; cy: number } = { cx: 43, cy: 20 },
): ReactElement {
  return (
    <g className="mascot__eyes">
      <ellipse className="mascot__eye mascot__eye--left" cx={left.cx} cy={left.cy} rx={size.rx} ry={size.ry} />
      <ellipse className="mascot__eye mascot__eye--right" cx={right.cx} cy={right.cy} rx={size.rx} ry={size.ry} />
    </g>
  );
}

/** Closed happy eyes — thick arcs punched as stroked mask paths. */
function eyeCrescents(): ReactElement {
  return (
    <g className="mascot__eyes" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round">
      <path className="mascot__eye mascot__eye--left" d="M23.5 20.5 A 3.5 2.6 0 0 1 30.5 20.5" />
      <path className="mascot__eye mascot__eye--right" d="M39.5 20.5 A 3.5 2.6 0 0 1 46.5 20.5" />
    </g>
  );
}

const MOUTH_IDLE =
  'M21 28 L25 34 L29 27 L33 35 L37 26 L41 35 L45 27 L49 34 L51 28 L49 39 L45 34 L41 41 L37 33 L33 41 L29 34 L25 40 L21 36 Z';
const MOUTH_WIDE =
  'M20 28 L24 34 L28 27 L32 35 L36 26 L40 35 L44 27 L48 34 L50 28 L48 40 L44 35 L40 42 L36 34 L32 42 L28 35 L24 41 L20 36 Z';
const MOUTH_SMILE = 'M22 30 C26 38 44 38 48 30 C44 34 26 34 22 30 Z';
const MOUTH_PROUD = 'M24 31 C28 37 42 37 46 31 C42 34.5 28 34.5 24 31 Z';
const MOUTH_SAD = 'M24 36 C28 31 42 31 46 36 C42 34 28 34 24 36 Z';
const MOUTH_THINK =
  'M28 32 L31 35 L34 32 L37 35.5 L40 32 L42 34.5 L44 32 L42 36 L40 34 L37 38 L34 34.5 L31 37.5 L28 35 Z';
const MOUTH_CONFUSED =
  'M23 31 C26 28 29 36 32 31 C35 26 38 36 41 31 C44 27 47 34 49 31 C47 37 44 35 41 38 C38 41 35 34 32 38 C29 41 26 34 23 37 Z';
const MOUTH_CURIOUS =
  'M24 29 L27 33 L30 29 L33 34 L36 29 L39 34 L42 29 L46 33 L48 29 L46 36 L42 33 L39 38 L36 33 L33 38 L30 33 L27 37 L24 33 Z';
const MOUTH_BUSY =
  'M23 29 L27 33.5 L31 28.5 L35 34.5 L39 28 L43 34.5 L47 29 L45 37 L41 33 L37 39 L33 33.5 L29 38.5 L25 34 L23 36 Z';

function faceFor(emotion: MascotEmotion): FaceParts {
  switch (emotion) {
    case 'happy':
      return {
        cutouts: (
          <>
            {eyeDiscs()}
            <path className="mascot__mouth" d={MOUTH_SMILE} />
          </>
        ),
        leftArm: 'M14 34 Q8 42 10 50',
        rightArm: 'M56 34 Q62 42 60 50',
      };
    case 'proud':
      return {
        cutouts: (
          <>
            {eyeCrescents()}
            <path className="mascot__mouth" d={MOUTH_PROUD} />
          </>
        ),
        leftArm: 'M14 34 Q7 38 9 46',
        rightArm: 'M56 34 Q63 38 61 46',
      };
    case 'curious':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 2.8, ry: 3.6 }, { cx: 27, cy: 19.5 }, { cx: 44, cy: 19.2 })}
            <path className="mascot__mouth" d={MOUTH_CURIOUS} />
          </>
        ),
        leftArm: 'M14 34 Q9 40 12 48',
        rightArm: 'M56 34 Q64 36 66 28',
      };
    case 'thinking':
      return {
        cutouts: (
          <>
            {eyeSlits(-18, -18, 19, 2.6, 3.2)}
            <path className="mascot__mouth" d={MOUTH_THINK} />
          </>
        ),
        leftArm: 'M14 34 Q10 42 18 44',
        rightArm: 'M56 34 Q62 40 54 45',
      };
    case 'excited':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 3.8, ry: 4.2 }, { cx: 27, cy: 19 }, { cx: 43, cy: 19 })}
            <path className="mascot__mouth" d={MOUTH_WIDE} />
          </>
        ),
        leftArm: 'M14 32 Q6 24 8 16',
        rightArm: 'M56 32 Q64 24 62 16',
      };
    case 'confused':
      return {
        cutouts: (
          <>
            <g className="mascot__eyes">
              <ellipse
                className="mascot__eye mascot__eye--left"
                cx="27"
                cy="18"
                rx="2.4"
                ry="3.5"
                transform="rotate(-28 27 18)"
              />
              <ellipse
                className="mascot__eye mascot__eye--right"
                cx="44"
                cy="21.5"
                rx="3.2"
                ry="2.6"
                transform="rotate(20 44 21.5)"
              />
            </g>
            <path className="mascot__mouth" d={MOUTH_CONFUSED} />
          </>
        ),
        leftArm: 'M14 34 Q8 44 14 50',
        rightArm: 'M56 34 Q64 44 58 52',
      };
    case 'sad':
      return {
        cutouts: (
          <>
            {eyeSlits(22, -22, 21, 2.8, 2.2)}
            <path className="mascot__mouth" d={MOUTH_SAD} />
          </>
        ),
        leftArm: 'M14 36 Q10 46 12 52',
        rightArm: 'M56 36 Q60 46 58 52',
      };
    case 'wave':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 3, ry: 3.2 })}
            <path className="mascot__mouth" d={MOUTH_WIDE} />
          </>
        ),
        leftArm: 'M14 34 Q9 42 11 50',
        rightArm: 'M56 32 Q66 22 64 12',
      };
    case 'busy':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 2.6, ry: 3.4 })}
            <path className="mascot__mouth" d={MOUTH_BUSY} />
          </>
        ),
        leftArm: 'M14 34 Q8 30 10 22',
        rightArm: 'M56 34 Q62 30 60 22',
      };
    case 'idle':
    default:
      return {
        cutouts: (
          <>
            {eyeSlits(-28, 28)}
            <path className="mascot__mouth" d={MOUTH_IDLE} />
          </>
        ),
        leftArm: 'M14 34 Q8 42 10 51',
        rightArm: 'M56 34 Q62 42 60 51',
      };
  }
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
  const face = faceFor(emotion);
  const height = Math.round((size * 60) / 70);
  const classes = ['mascot', `mascot--${emotion}`, staticPose ? 'mascot--static' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={classes}
      width={size}
      height={height}
      viewBox="0 0 70 60"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}

      <defs>
        {/* White = keep body, black = punch through (eyes, mouth, ear holes). */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="70" height="60">
          <g fill="#fff">
            <circle cx="12" cy="24" r="9.5" />
            <circle cx="58" cy="24" r="9.5" />
            <rect x="14" y="8" width="42" height="38" rx="11" ry="11" />
            <rect x="22" y="44" width="9" height="12" rx="2.5" />
            <rect x="39" y="44" width="9" height="12" rx="2.5" />
          </g>
          <g fill="#000">
            <circle cx="12" cy="24" r="4.2" />
            <circle cx="58" cy="24" r="4.2" />
            {face.cutouts}
          </g>
        </mask>
      </defs>

      <g className="mascot__body-group">
        <g mask={`url(#${maskId})`}>
          <rect x="0" y="0" width="70" height="60" fill="currentColor" />
        </g>

        {/* Arms live outside the mask so CSS can swing them. */}
        <g className="mascot__arms" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path className="mascot__arm mascot__arm--left" d={face.leftArm} />
          <path className="mascot__arm mascot__arm--right" d={face.rightArm} />
        </g>
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
