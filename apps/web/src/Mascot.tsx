/**
 * Digitized gamedev.pl monster mascot.
 *
 * Idle is pixel-perfect: horizontal spans traced from `logo-gamedev.png` (70×60).
 * Other emotions start from the same silhouette with the face holes filled back in
 * (`MASCOT_SOLID_SPANS`), then punch new eyes/mouth via an SVG mask.
 *
 * Animation lives in layered SVG groups + CSS (bob, bounce, sway, blink lids,
 * waving arm). `staticPose` freezes everything; `prefers-reduced-motion` does too.
 *
 * `InteractiveMascot` wraps the SVG in a button: hover peeks, click cycles
 * reactions, and the face tracks the pointer a little.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { MASCOT_IDLE_SPANS, MASCOT_SOLID_SPANS } from './mascotSpans.js';

export type MascotEmotion =
  'idle' | 'happy' | 'curious' | 'thinking' | 'excited' | 'confused' | 'sad' | 'proud' | 'wave' | 'busy';

/** Normalized look direction in roughly [-1, 1] for each axis. */
export type MascotLook = { x: number; y: number };

type MascotProps = {
  emotion?: MascotEmotion;
  size?: number;
  className?: string;
  title?: string;
  /**
   * When true, all motion is forced off. Nothing in the app sets this today — the
   * header mark breathes like every other instance — but a still frame is what a
   * favicon/OG rasteriser or a print stylesheet would want.
   */
  staticPose?: boolean;
  /** Nudge face cutouts toward a point — no-op on the baked idle silhouette. */
  look?: MascotLook;
};

type Span = readonly [number, number, number];

/**
 * Trace the outline of a pixel-span set, so the body is one path with no edges
 * running through its middle.
 *
 * The body used to be one `<rect>` per span — around 200 of them, each 1px tall.
 * Separate shapes are antialiased separately, and two neighbours each contributing
 * partial coverage at their shared boundary do not add up to full coverage, so a
 * seam showed on every row: horizontal banding, and speckle once downscaled.
 *
 * Merging the spans into one path is not enough on its own. Coincident interior
 * edges only cancel exactly while the shape is axis-aligned; the moment it is
 * rotated — and `peek`, `ponder`, `hustle`, `sigh` and `wobble` all rotate up to
 * 6deg — the seams come back. So we emit the true union outline instead: the
 * boundary between filled and empty pixels, and nothing else. There are no interior
 * edges left to seam, at any angle.
 *
 * Edges are wound so that outer loops and hole loops run opposite ways, which is
 * what the default nonzero fill needs to punch the ear rings out.
 */
function spansToOutlinePath(spans: ReadonlyArray<Span>): string {
  const filled = Array.from({ length: 60 }, () => Array<boolean>(70).fill(false));
  for (const [x, y, width] of spans) {
    for (let i = 0; i < width; i++) filled[y][x + i] = true;
  }
  const isFilled = (x: number, y: number) => x >= 0 && x < 70 && y >= 0 && y < 60 && filled[y][x];

  const key = (x: number, y: number) => x * 100 + y;
  const steps = new Map<number, Array<[number, number]>>();
  const addEdge = (fx: number, fy: number, tx: number, ty: number) => {
    const from = key(fx, fy);
    const list = steps.get(from);
    if (list) list.push([tx, ty]);
    else steps.set(from, [[tx, ty]]);
  };
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 70; x++) {
      if (!filled[y][x]) continue;
      if (!isFilled(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!isFilled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!isFilled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!isFilled(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const parts: string[] = [];
  while (steps.size) {
    const startKey = steps.keys().next().value as number;
    const start: [number, number] = [Math.floor(startKey / 100), startKey % 100];
    const loop: Array<[number, number]> = [start];
    let cursor = start;
    for (;;) {
      const list = steps.get(key(cursor[0], cursor[1]));
      if (!list || list.length === 0) break;
      const step = list.pop()!;
      if (list.length === 0) steps.delete(key(cursor[0], cursor[1]));
      loop.push(step);
      cursor = step;
      if (cursor[0] === start[0] && cursor[1] === start[1]) break;
    }

    // Drop the repeated closing point, then collapse runs of collinear corners.
    const points = loop.slice(0, -1);
    const corners = points.filter((point, i) => {
      const before = points[(i - 1 + points.length) % points.length];
      const after = points[(i + 1) % points.length];
      return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0]);
    });
    if (corners.length < 3) continue;

    let [cx, cy] = corners[0];
    const d = [`M${cx} ${cy}`];
    for (const [px, py] of corners.slice(1)) {
      d.push(px === cx ? `v${py - cy}` : `h${px - cx}`);
      cx = px;
      cy = py;
    }
    d.push('Z');
    parts.push(d.join(''));
  }
  return parts.join('');
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

// Traced once at module load — the spans never change.
const IDLE_PATH = spansToOutlinePath(MASCOT_IDLE_SPANS);
const SOLID_PATH = spansToOutlinePath(MASCOT_SOLID_SPANS);

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
          {eyeSlits({ cx: 33, cy: 4.2, rot: -36, rx: 2.1, ry: 1.5 }, { cx: 43, cy: 6.5, rot: 18, rx: 2.7, ry: 1.25 })}
          <path className="mascot__mouth" d={MOUTH_CONFUSED} />
        </>
      );
    case 'sad':
      return (
        <>
          {eyeSlits({ cx: 34, cy: 6.2, rot: 22, rx: 2.3, ry: 1.1 }, { cx: 42, cy: 6.2, rot: -22, rx: 2.3, ry: 1.1 })}
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
  look,
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
  // Keep the nudge small — past ~3px the mouth starts to clip the silhouette.
  const lookTransform =
    look && !isIdle ? `translate(${(look.x * 2.4).toFixed(2)} ${(look.y * 1.8).toFixed(2)})` : undefined;

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
            <path d={IDLE_PATH} />
          </g>
        ) : (
          <>
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="70" height="60">
                <path fill="#fff" d={SOLID_PATH} />
                <g fill="#000" className="mascot__face-features" transform={lookTransform}>
                  {cutouts}
                </g>
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
          <g className="mascot__wave-arm" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M64 36 Q70 26 67 14" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}

/** Playful reactions cycled when the visitor pokes the splash mascot. */
const POKE_REACTIONS: readonly MascotEmotion[] = [
  'excited',
  'happy',
  'curious',
  'proud',
  'thinking',
  'confused',
];

const POKE_HOLD_MS = 1400;

type InteractiveMascotProps = {
  size?: number;
  className?: string;
  /** Resting emotion between pokes (default: wave). */
  idleEmotion?: MascotEmotion;
  /** Accessible name for the poke control. */
  pokeLabel: string;
};

/**
 * Clickable mascot for branded empty states (splash, etc.).
 * Hover peeks, click cycles a reaction, pointer position nudges the face.
 */
export function InteractiveMascot({
  size = 96,
  className,
  idleEmotion = 'wave',
  pokeLabel,
}: InteractiveMascotProps) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionIndex = useRef(0);
  const hoveredRef = useRef(false);
  const pokingRef = useRef(false);
  const lookRef = useRef<MascotLook>({ x: 0, y: 0 });
  const [emotion, setEmotion] = useState<MascotEmotion>(idleEmotion);
  const [look, setLook] = useState<MascotLook>({ x: 0, y: 0 });
  const [poking, setPoking] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reduceMotionRef.current = media.matches;
      setReduceMotion(media.matches);
    };
    sync();
    // MediaQueryList used addListener/removeListener before addEventListener landed in Safari.
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    return () => {
      if (pokeTimer.current) clearTimeout(pokeTimer.current);
    };
  }, []);

  // Reduced motion still gets the emotion swap — only tilt/boop are suppressed.
  const settleEmotion = () => (hoveredRef.current ? 'curious' : idleEmotion);

  const clearPokeTimer = () => {
    if (pokeTimer.current) {
      clearTimeout(pokeTimer.current);
      pokeTimer.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduceMotionRef.current) return;
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    const next = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1),
      y: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1),
    };
    // Skip sub-pixel wiggles so pointermove does not re-render at 60–120Hz.
    const prev = lookRef.current;
    if (Math.abs(next.x - prev.x) < 0.04 && Math.abs(next.y - prev.y) < 0.04) return;
    lookRef.current = next;
    setLook(next);
  };

  const resetLook = () => {
    lookRef.current = { x: 0, y: 0 };
    setLook({ x: 0, y: 0 });
  };

  const handlePoke = () => {
    const next = POKE_REACTIONS[reactionIndex.current % POKE_REACTIONS.length]!;
    reactionIndex.current += 1;
    pokingRef.current = true;
    setPoking(true);
    setEmotion(next);
    clearPokeTimer();
    pokeTimer.current = setTimeout(() => {
      pokingRef.current = false;
      setPoking(false);
      setEmotion(settleEmotion());
      pokeTimer.current = null;
    }, POKE_HOLD_MS);
  };

  const tiltStyle: CSSProperties | undefined = reduceMotion
    ? undefined
    : {
        transform: `rotate(${(look.x * 7).toFixed(2)}deg) translateY(${(look.y * 2).toFixed(2)}px)`,
      };

  return (
    <button
      ref={rootRef}
      type="button"
      className={['mascot-interactive', poking ? 'mascot-interactive--poking' : null, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={pokeLabel}
      onClick={handlePoke}
      onPointerEnter={() => {
        hoveredRef.current = true;
        if (!pokingRef.current) setEmotion('curious');
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        resetLook();
        if (!pokingRef.current) setEmotion(idleEmotion);
      }}
      onPointerMove={handlePointerMove}
      onBlur={() => {
        hoveredRef.current = false;
        resetLook();
        if (!pokingRef.current) setEmotion(idleEmotion);
      }}
    >
      {/* Tilt lives on an inner span so the button can still run the poke squash. */}
      <span className="mascot-interactive__tilt" style={tiltStyle}>
        {/* Button owns the accessible name; keep the SVG presentational to avoid a double announce. */}
        <Mascot emotion={emotion} size={size} look={reduceMotion ? undefined : look} />
      </span>
    </button>
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
export function MascotMoment({ emotion = 'idle', size = 64, className, title, children }: MascotMomentProps) {
  return (
    <div className={['mascot-moment', className].filter(Boolean).join(' ')}>
      <Mascot emotion={emotion} size={size} title={title} />
      {children ? <div className="mascot-moment__copy">{children}</div> : null}
    </div>
  );
}
