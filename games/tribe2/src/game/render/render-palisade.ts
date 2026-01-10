import { pseudoRandom } from './render-utils';

export const PALISADE_PALETTE = {
  base: '#8B5A2B',
  highlight: '#A67C52',
  shadow: '#5C3A1E',
  outline: '#362010',
};

const PALISADE_INNER_SHADOW = '#2A1A0E'; // Very dark brown for deep interior shadow

export interface PalisadeConnection {
  angle: number; // Radians
  distance: number;
}

export interface PalisadeConnections {
  connections: PalisadeConnection[];
  isInner: boolean;
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
 * Renders a palisade segment with 3D volumes and territory-based orientation.
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
  const railHeight = 5;

  ctx.save();

  // 1. Connections (Filler segments)
  // Draw these first so they appear behind the main post
  for (const conn of connections.connections) {
    ctx.save();
    ctx.rotate(conn.angle);
    // Draw rail from center towards neighbor, overlapping slightly to midpoint
    drawPixelBlock(ctx, 0, -railHeight / 2, conn.distance / 2 + 1, railHeight, false);
    ctx.restore();
  }

  // 2. Main Wall Structure
  if (connections.isInner) {
    // --- INNER SIDE (Structural View) ---
    // Background shade for the "back" of the wall
    // Use a very dark color to simulate the shadowed interior face
    ctx.fillStyle = PALISADE_INNER_SHADOW;
    ctx.fillRect(-halfW + 2, -halfH + 2, width - 4, height - 4);

    // Identify approximate cardinal connections for structural rails
    // Threshold 0.8 means roughly within 36 degrees of the cardinal axis
    const hasHorizontal = connections.connections.some(c => Math.abs(Math.cos(c.angle)) > 0.8);
    const hasVertical = connections.connections.some(c => Math.abs(Math.sin(c.angle)) > 0.8);

    // Structural Rails
    if (hasHorizontal) {
      // Top Rail
      drawPixelBlock(ctx, -halfW, -halfH + 4, width, railHeight, false);
      // Bottom Rail
      drawPixelBlock(ctx, -halfW, halfH - railHeight - 4, width, railHeight, false);
    } 
    if (hasVertical) {
       // Vertical Rails (if vertical wall)
      drawPixelBlock(ctx, -halfW + 4, -halfH, railHeight, height, true);
      drawPixelBlock(ctx, halfW - railHeight - 4, -halfH, railHeight, height, true);
    }

  } else {
    // --- OUTER SIDE (Fortified View) ---
    // Solid wall of vertical planks
    const startX = -halfW;
    const endX = halfW;
    
    // Draw planks across the width
    for (let x = startX; x < endX; x += plankWidth) {
      // Add some height variation based on seed
      const hVariation = (pseudoRandom(seed + x) - 0.5) * 4;
      const effectiveHeight = height + hVariation;
      const effectiveY = -effectiveHeight / 2;
      
      // Ensure we don't draw outside the tile too much
      const w = Math.min(plankWidth, endX - x);
      
      drawPixelBlock(ctx, x, effectiveY, w, effectiveHeight, true);
    }
  }

  // 3. Main Center Post (The anchor point)
  // Always draw a thick post at the center to cover seams and add weight
  const postSize = width * 0.5;
  drawPixelBlock(ctx, -postSize / 2, -halfH - 4, postSize, height + 6, true);

  // 4. Tribe Accent (Badge/Paint)
  ctx.fillStyle = tribeColor;
  ctx.globalAlpha = 0.8;
  // Draw a painted stripe on the post
  ctx.fillRect(-postSize / 2 + 2, -height / 6, postSize - 4, height / 3);
  ctx.globalAlpha = 1.0;

  // 5. Pointed Top (Spike)
  // Only draw if there is no connection in the upward arc (-150 to -30 degrees)
  const hasTopConnection = connections.connections.some(c => {
    const deg = (c.angle * 180) / Math.PI;
    return deg > -150 && deg < -30;
  });

  if (!hasTopConnection) {
    const spikeHeight = 10;
    const spikeY = -halfH - 4;
    
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
