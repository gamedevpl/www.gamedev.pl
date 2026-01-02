import { Vector2D } from './math-types';

export function vectorAdd(v1: Vector2D, v2: Vector2D): Vector2D {
  return {
    x: v1.x + v2.x,
    y: v1.y + v2.y,
  };
}

export function vectorSubtract(v1: Vector2D, v2: Vector2D): Vector2D {
  return {
    x: v1.x - v2.x,
    y: v1.y - v2.y,
  };
}

export function vectorScale(v: Vector2D, scalar: number): Vector2D {
  return {
    x: v.x * scalar,
    y: v.y * scalar,
  };
}

export function vectorLength(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vectorNormalize(v: Vector2D): Vector2D {
  const length = vectorLength(v);
  if (length === 0) return { x: 0, y: 0 };
  return vectorScale(v, 1 / length);
}

export function vectorDistance(v1: Vector2D, v2: Vector2D): number {
  return vectorLength(vectorSubtract(v1, v2));
}

export function vectorLerp(v1: Vector2D, v2: Vector2D, t: number): Vector2D {
  return {
    x: v1.x + (v2.x - v1.x) * t,
    y: v1.y + (v2.y - v1.y) * t,
  };
}

export function getAveragePosition(positions: Vector2D[]): Vector2D {
  if (positions.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = positions.reduce((acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }), { x: 0, y: 0 });

  return {
    x: sum.x / positions.length,
    y: sum.y / positions.length,
  };
}

export function getDirectionVectorOnTorus(
  from: Vector2D,
  to: Vector2D,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  let dx = to.x - from.x;
  let dy = to.y - from.y;

  // Wrap around horizontally if shorter
  if (Math.abs(dx) > worldWidth / 2) {
    dx = dx - Math.sign(dx) * worldWidth;
  }

  // Wrap around vertically if shorter
  if (Math.abs(dy) > worldHeight / 2) {
    dy = dy - Math.sign(dy) * worldHeight;
  }

  return { x: dx, y: dy };
}

export function dirToTarget(
  position: Vector2D,
  targetPosition: Vector2D,
  mapDimensions: { width: number; height: number },
) {
  const dirToTarget = getDirectionVectorOnTorus(position, targetPosition, mapDimensions.width, mapDimensions.height);
  return vectorNormalize(dirToTarget);
}

export function calculateWrappedDistance(v1: Vector2D, v2: Vector2D, worldWidth: number, worldHeight: number): number {
  // Inline the math to avoid object allocation
  return Math.sqrt(calculateWrappedDistanceSq(v1, v2, worldWidth, worldHeight));
}

export function calculateWrappedDistanceSq(v1: Vector2D, v2: Vector2D, worldWidth: number, worldHeight: number): number {
  // Inline getDirectionVectorOnTorus to avoid object allocation
  let dx = v2.x - v1.x;
  let dy = v2.y - v1.y;

  // Wrap around horizontally if shorter
  if (dx > worldWidth / 2) {
    dx -= worldWidth;
  } else if (dx < -worldWidth / 2) {
    dx += worldWidth;
  }

  // Wrap around vertically if shorter
  if (dy > worldHeight / 2) {
    dy -= worldHeight;
  } else if (dy < -worldHeight / 2) {
    dy += worldHeight;
  }

  return dx * dx + dy * dy;
}

export function vectorDot(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y;
}

export function vectorProject(v: Vector2D, onto: Vector2D): Vector2D {
  const ontoLengthSq = onto.x * onto.x + onto.y * onto.y;
  if (ontoLengthSq === 0) return { x: 0, y: 0 };
  const dot = vectorDot(v, onto);
  return vectorScale(onto, dot / ontoLengthSq);
}

export function vectorRejection(v: Vector2D, onto: Vector2D): Vector2D {
  return vectorSubtract(v, vectorProject(v, onto));
}

export function vectorAngleBetween(v1: Vector2D, v2: Vector2D): number {
  const dot = vectorDot(v1, v2);
  const length1 = vectorLength(v1);
  const length2 = vectorLength(v2);
  if (length1 === 0 || length2 === 0) return 0;
  // Clamp the dot product ratio to avoid floating point errors leading to Math.acos returning NaN
  const cosTheta = Math.max(-1, Math.min(1, dot / (length1 * length2)));
  return Math.acos(cosTheta);
}

/** @public */
export function vectorRotate(v: Vector2D, angle: number): Vector2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

export function lerpColor(color1: string, color2: string, t: number): string {
  // Clamp t to be between 0 and 1
  const factor = Math.max(0, Math.min(1, t));

  // Remove '#' and parse hex to R, G, B integers
  const c1 = {
    r: parseInt(color1.substring(1, 3), 16),
    g: parseInt(color1.substring(3, 5), 16),
    b: parseInt(color1.substring(5, 7), 16),
  };
  const c2 = {
    r: parseInt(color2.substring(1, 3), 16),
    g: parseInt(color2.substring(3, 5), 16),
    b: parseInt(color2.substring(5, 7), 16),
  };

  // Interpolate each component
  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);

  // Convert back to hex and pad with '0' if needed
  const toHex = (c: number) => ('00' + c.toString(16)).slice(-2);

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
