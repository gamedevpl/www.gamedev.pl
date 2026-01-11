import { pseudoRandom } from './render-utils';

export const PALISADE_PALETTE = {
  base: '#8B5A2B',
  highlight: '#A67C52',
  shadow: '#5C3A1E',
  outline: '#362010',
};

export const PALISADE_INNER_SHADOW = '#2A1A0E'; // Very dark brown for deep interior shadow

export const PALISADE_DEFAULT_HEIGHT = 20;

export interface PalisadeConnection {
  angle: number; // Radians
  distance: number;
}

export interface PalisadeConnections {
  connections: PalisadeConnection[];
  isInner: boolean;
  /** If true, the wall is seen from the side (strictly North-South profile). */
  isVertical: boolean;
  /** Overall orientation of the wall segment in radians. */
  wallAngle: number;
  hasGateNeighbor: boolean;
}

/**
 * Draws a 3D-looking pixel block with an outline, base fill, and highlight/shadow borders.
 * Simulates depth by lighting the top/left edges and shading the bottom/right edges.
 */
export function drawPixelBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  isVertical: boolean = true,
) {
  ctx.save();

  // 1. Outline
  ctx.fillStyle = PALISADE_PALETTE.outline;
  ctx.fillRect(x, y, w, h);

  // 2. Base Fill (inset by 1px)
  ctx.fillStyle = PALISADE_PALETTE.base;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

  // 3. Highlight/Shadow (1-2px)
  if (isVertical) {
    // Light on left, Shadow on right
    ctx.fillStyle = PALISADE_PALETTE.highlight;
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillStyle = PALISADE_PALETTE.shadow;
    ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  } else {
    // Light on top, Shadow on bottom
    ctx.fillStyle = PALISADE_PALETTE.highlight;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = PALISADE_PALETTE.shadow;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  }

  ctx.restore();
}

/**
 * Renders a solid filler segment between palisade units.
 */
export function drawPalisadeConnection(
  ctx: CanvasRenderingContext2D,
  distance: number,
  angle: number,
  height: number,
  seed: number,
  isInner: boolean,
  isVertical: boolean,
) {
  const connLength = distance / 2 + 2; // Overlap slightly to midpoint
  const plankWidth = 5;

  ctx.save();
  ctx.rotate(angle);

  if (isVertical) {
    // --- VERTICAL CONNECTION (Side Profile) ---
    const wallThickness = 8;
    
    if (isInner) {
      ctx.fillStyle = PALISADE_INNER_SHADOW;
      ctx.fillRect(0, -wallThickness / 2, connLength, wallThickness);
      // Structural rail
      drawPixelBlock(ctx, 0, -wallThickness / 2, connLength, 3, false);
    } else {
      drawPixelBlock(ctx, 0, -wallThickness / 2, connLength, wallThickness, false);
    }
  } else {
    // --- HORIZONTAL/DIAGONAL CONNECTION (Front Face) ---
    if (isInner) {
      ctx.fillStyle = PALISADE_INNER_SHADOW;
      ctx.fillRect(0, -height / 2 + 2, connLength, height - 4);
      
      // Two horizontal rails
      drawPixelBlock(ctx, 0, -height / 2 + 4, connLength, 5, false);
      drawPixelBlock(ctx, 0, height / 2 - 9, connLength, 5, false);
    } else {
      for (let x = 0; x < connLength; x += plankWidth) {
        const hVar = (pseudoRandom(seed + x + angle) - 0.5) * 4;
        const pHeight = height + hVar;
        const w = Math.min(plankWidth, connLength - x);
        drawPixelBlock(ctx, x, -pHeight / 2, w, pHeight, true);
      }
    }
  }

  ctx.restore();
}

/**
 * Renders a palisade segment with 2.5D perspective.
 */
export function drawPalisade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  tribeColor: string,
  connections: PalisadeConnections,
) {
  const halfW = width / 2;
  const halfH = height / 2;
  const plankWidth = 5;

  ctx.save();

  // 1. Connections (Filler segments)
  // Draw these first so they appear behind the main post
  for (const conn of connections.connections) {
    drawPalisadeConnection(
      ctx,
      conn.distance,
      conn.angle,
      height,
      seed,
      connections.isInner,
      connections.isVertical
    );
  }

  // 2. Main Wall Structure
  if (connections.isVertical) {
    // --- VERTICAL WALL (Side Profile) ---
    // In 2.5D, vertical walls are seen from the side, appearing as a thick block.
    const wallThickness = width * 0.4;
    const wallHeight = height + 4;
    
    if (connections.isInner) {
      // Back side: Dark shadow with structural rails
      ctx.fillStyle = PALISADE_INNER_SHADOW;
      ctx.fillRect(-wallThickness / 2, -wallHeight / 2, wallThickness, wallHeight);
      // Vertical "rails" (posts)
      drawPixelBlock(ctx, -wallThickness / 2, -wallHeight / 2, 3, wallHeight, true);
    } else {
      // Front side: Solid fortified block
      drawPixelBlock(ctx, -wallThickness / 2, -wallHeight / 2, wallThickness, wallHeight, true);
    }
  } else {
    // --- HORIZONTAL OR DIAGONAL WALL ---
    // Horizontal walls show the front face of planks. 
    // Diagonals are foreshortened by skewing the plank positions.
    const skew = Math.sin(connections.wallAngle) * 0.6;

    if (connections.isInner) {
      // --- INNER SIDE (Structural) ---
      // Background shade for the shadowed interior face
      ctx.fillStyle = PALISADE_INNER_SHADOW;
      ctx.fillRect(-halfW + 2, -halfH + 2, width - 4, height - 4);
      
      // Horizontal Rails (top and bottom)
      drawPixelBlock(ctx, -halfW, -halfH + 4, width, 5, false);
      drawPixelBlock(ctx, -halfW, halfH - 5 - 4, width, 5, false);
    } else {
      // --- OUTER SIDE (Planks) ---
      const startX = -halfW;
      const endX = halfW;

      for (let x = startX; x < endX; x += plankWidth) {
        // Add height variation for a \"rugged\" look
        const hVar = (pseudoRandom(seed + x) - 0.5) * 4;
        const pHeight = height + hVar;
        // Skew the vertical position based on connection angle
        const pY = -pHeight / 2 + (x * skew);

        drawPixelBlock(ctx, x, pY, Math.min(plankWidth, endX - x), pHeight, true);
      }
    }
  }

  // 3. Main Center Post (Anchor)
  // Thicker post to cover seams and provide a base for the spike
  const postSize = width * 0.5;
  const postH = height + 8;
  drawPixelBlock(ctx, -postSize / 2, -postH / 2, postSize, postH, true);

  // 4. Tribe Accent
  ctx.fillStyle = tribeColor;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(-postSize / 2 + 2, -height / 6, postSize - 4, height / 3);
  ctx.globalAlpha = 1.0;

  // 5. Pointed Top (Spike)
  // Suppress if there's a northern neighbor (Palisade or Gate)
  const hasTopConnection = connections.connections.some((c) => {
    let deg = (c.angle * 180) / Math.PI;
    // Normalize to -180 to 180
    while (deg <= -180) deg += 360;
    while (deg > 180) deg -= 360;
    // North is -90. Check arc from -150 to -30
    return deg > -150 && deg < -30;
  });

  if (!hasTopConnection && !connections.hasGateNeighbor) {
    const spikeHeight = 10;
    const spikeY = -postH / 2;

    ctx.fillStyle = PALISADE_PALETTE.outline;
    ctx.beginPath();
    ctx.moveTo(-postSize / 2, spikeY);
    ctx.lineTo(0, spikeY - spikeHeight);
    ctx.lineTo(postSize / 2, spikeY);
    ctx.fill();

    // Highlight on left face of spike
    ctx.fillStyle = PALISADE_PALETTE.highlight;
    ctx.beginPath();
    ctx.moveTo(-postSize / 2 + 1, spikeY);
    ctx.lineTo(0, spikeY - spikeHeight + 1);
    ctx.lineTo(0, spikeY);
    ctx.fill();
  }

  ctx.restore();
}
