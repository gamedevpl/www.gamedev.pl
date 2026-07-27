/**
 * Digitized gamedev.pl monster mascot — the turquoise logo creature, as a layered
 * SVG so it can change expression and gesture.
 *
 * Geometry is traced from `logo-gamedev.png` (70×60): eyes sit near the crown,
 * the jagged mouth owns most of the torso, donut ears hang mid-side, stick arms
 * drop beside the block legs. Face features are real mask cutouts so the creature
 * sits cleanly on any background. Emotions swap cutouts + arm paths; CSS adds
 * blink / bob / bounce / wave. Respects `prefers-reduced-motion`.
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

/** Default logo mouth — wide sawtooth traced from the PNG. */
const MOUTH_IDLE =
  'M18 12 L22 18 L26 11 L30 19 L35 10 L40 19 L44 11 L48 18 L52 12 L52 34 L48 28 L44 36 L40 27 L35 37 L30 28 L26 36 L22 29 L18 34 Z';

const MOUTH_WIDE =
  'M16 11 L21 19 L26 10 L31 20 L35 9 L39 20 L44 10 L49 19 L54 11 L54 36 L49 30 L44 38 L39 29 L35 39 L31 30 L26 38 L21 31 L16 36 Z';

const MOUTH_SMILE = 'M22 20 C27 33 43 33 48 20 C43 27 27 27 22 20 Z';

const MOUTH_PROUD = 'M24 22 C29 32 41 32 46 22 C41 28 29 28 24 22 Z';

const MOUTH_SAD = 'M24 28 C29 21 41 21 46 28 C41 25 29 25 24 28 Z';

const MOUTH_THINK =
  'M24 18 L28 23 L32 17 L36 24 L40 16 L44 23 L48 18 L48 30 L44 26 L40 32 L36 25 L32 31 L28 26 L24 30 Z';

const MOUTH_CONFUSED =
  'M18 16 C22 12 26 24 30 16 C34 10 38 24 42 16 C46 12 50 22 52 16 C50 28 46 26 42 32 C38 36 34 24 30 32 C26 36 22 24 18 30 Z';

const MOUTH_CURIOUS =
  'M20 14 L24 20 L28 13 L32 21 L36 12 L40 21 L44 13 L48 20 L52 14 L52 32 L48 27 L44 34 L40 26 L36 35 L32 27 L28 34 L24 28 L20 32 Z';

const MOUTH_BUSY =
  'M20 14 L25 20 L30 13 L35 21 L40 12 L45 21 L50 14 L50 32 L45 27 L40 34 L35 26 L30 33 L25 27 L20 31 Z';

const ARM_IDLE_L = 'M5 40 Q3 46 4 52';
const ARM_IDLE_R = 'M65 40 Q67 46 66 52';

function eyeSlits(
  left: { cx: number; cy: number; rot: number; rx?: number; ry?: number },
  right: { cx: number; cy: number; rot: number; rx?: number; ry?: number },
): ReactElement {
  const lrx = left.rx ?? 2.2;
  const lry = left.ry ?? 1.1;
  const rrx = right.rx ?? 2.2;
  const rry = right.ry ?? 1.1;
  return (
    <g className="mascot__eyes">
      <ellipse
        className="mascot__eye mascot__eye--left"
        cx={left.cx}
        cy={left.cy}
        rx={lrx}
        ry={lry}
        transform={`rotate(${left.rot} ${left.cx} ${left.cy})`}
      />
      <ellipse
        className="mascot__eye mascot__eye--right"
        cx={right.cx}
        cy={right.cy}
        rx={rrx}
        ry={rry}
        transform={`rotate(${right.rot} ${right.cx} ${right.cy})`}
      />
    </g>
  );
}

function eyeDiscs(
  size: { rx: number; ry: number },
  left: { cx: number; cy: number },
  right: { cx: number; cy: number },
): ReactElement {
  return (
    <g className="mascot__eyes">
      <ellipse className="mascot__eye mascot__eye--left" cx={left.cx} cy={left.cy} rx={size.rx} ry={size.ry} />
      <ellipse className="mascot__eye mascot__eye--right" cx={right.cx} cy={right.cy} rx={size.rx} ry={size.ry} />
    </g>
  );
}

function eyeCrescents(): ReactElement {
  return (
    <g className="mascot__eyes" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round">
      <path className="mascot__eye mascot__eye--left" d="M31 6.5 A 3.2 2.4 0 0 1 37.5 6.5" />
      <path className="mascot__eye mascot__eye--right" d="M38.5 6.5 A 3.2 2.4 0 0 1 45 6.5" />
    </g>
  );
}

function faceFor(emotion: MascotEmotion): FaceParts {
  switch (emotion) {
    case 'happy':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 2.8, ry: 3 }, { cx: 34, cy: 6 }, { cx: 42, cy: 6 })}
            <path className="mascot__mouth" d={MOUTH_SMILE} />
          </>
        ),
        leftArm: ARM_IDLE_L,
        rightArm: ARM_IDLE_R,
      };
    case 'proud':
      return {
        cutouts: (
          <>
            {eyeCrescents()}
            <path className="mascot__mouth" d={MOUTH_PROUD} />
          </>
        ),
        leftArm: 'M5 40 Q2 44 6 48',
        rightArm: 'M65 40 Q68 44 64 48',
      };
    case 'curious':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 2.4, ry: 3.2 }, { cx: 33.5, cy: 5.5 }, { cx: 43, cy: 5 })}
            <path className="mascot__mouth" d={MOUTH_CURIOUS} />
          </>
        ),
        leftArm: ARM_IDLE_L,
        rightArm: 'M65 40 Q68 34 66 28',
      };
    case 'thinking':
      return {
        cutouts: (
          <>
            {eyeSlits(
              { cx: 33.5, cy: 5, rot: -24, rx: 2.4, ry: 1.4 },
              { cx: 41.5, cy: 5, rot: -24, rx: 2.4, ry: 1.4 },
            )}
            <path className="mascot__mouth" d={MOUTH_THINK} />
          </>
        ),
        leftArm: 'M5 40 Q4 46 12 48',
        rightArm: 'M65 40 Q66 46 58 48',
      };
    case 'excited':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 3.4, ry: 3.8 }, { cx: 34, cy: 5.5 }, { cx: 42, cy: 5.5 })}
            <path className="mascot__mouth" d={MOUTH_WIDE} />
          </>
        ),
        leftArm: 'M5 38 Q1 28 4 20',
        rightArm: 'M65 38 Q69 28 66 20',
      };
    case 'confused':
      return {
        cutouts: (
          <>
            {eyeSlits(
              { cx: 33, cy: 4.5, rot: -36, rx: 2.2, ry: 1.5 },
              { cx: 43, cy: 7, rot: 18, rx: 2.8, ry: 1.3 },
            )}
            <path className="mascot__mouth" d={MOUTH_CONFUSED} />
          </>
        ),
        leftArm: 'M5 40 Q2 48 6 54',
        rightArm: 'M65 40 Q68 48 64 54',
      };
    case 'sad':
      return {
        cutouts: (
          <>
            {eyeSlits(
              { cx: 34, cy: 7, rot: 22, rx: 2.4, ry: 1.1 },
              { cx: 42, cy: 7, rot: -22, rx: 2.4, ry: 1.1 },
            )}
            <path className="mascot__mouth" d={MOUTH_SAD} />
          </>
        ),
        leftArm: 'M5 42 Q3 50 4 55',
        rightArm: 'M65 42 Q67 50 66 55',
      };
    case 'wave':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 2.8, ry: 3 }, { cx: 34, cy: 6 }, { cx: 42, cy: 6 })}
            <path className="mascot__mouth" d={MOUTH_WIDE} />
          </>
        ),
        leftArm: ARM_IDLE_L,
        rightArm: 'M65 38 Q70 28 68 18',
      };
    case 'busy':
      return {
        cutouts: (
          <>
            {eyeDiscs({ rx: 2.4, ry: 3 }, { cx: 34, cy: 6 }, { cx: 42, cy: 6 })}
            <path className="mascot__mouth" d={MOUTH_BUSY} />
          </>
        ),
        leftArm: 'M5 40 Q2 34 4 26',
        rightArm: 'M65 40 Q68 34 66 26',
      };
    case 'idle':
    default:
      return {
        cutouts: (
          <>
            {eyeSlits({ cx: 34, cy: 5.5, rot: -28 }, { cx: 41.5, cy: 5.5, rot: 28 })}
            <path className="mascot__mouth" d={MOUTH_IDLE} />
          </>
        ),
        leftArm: ARM_IDLE_L,
        rightArm: ARM_IDLE_R,
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
            {/* Side ears — donut discs mid-body, matching the PNG. */}
            <circle cx="7.5" cy="25.5" r="7.5" />
            <circle cx="62.5" cy="25.5" r="7.5" />
            {/* Torso — rounded block from the crown down to the hips. */}
            <rect x="13" y="1" width="44" height="48" rx="12" ry="12" />
            {/* Legs */}
            <rect x="20" y="48" width="9" height="11" rx="2.5" />
            <rect x="40" y="48" width="9" height="11" rx="2.5" />
          </g>
          <g fill="#000">
            <circle cx="7.5" cy="25.5" r="2.6" />
            <circle cx="62.5" cy="25.5" r="2.6" />
            {face.cutouts}
          </g>
        </mask>
      </defs>

      <g className="mascot__body-group">
        <g mask={`url(#${maskId})`}>
          <rect x="0" y="0" width="70" height="60" fill="currentColor" />
        </g>

        {/* Arms live outside the mask so CSS can swing them. */}
        <g className="mascot__arms" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
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
