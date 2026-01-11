import {
  drawPalisadeConnection,
  drawPixelBlock,
  PALISADE_DEFAULT_HEIGHT,
  PALISADE_INNER_SHADOW,
  PALISADE_PALETTE,
  PalisadeConnections,
} from './render-palisade';
import { pseudoRandom } from './render-utils';

const METAL_PALETTE = {
  base: '#4A4A4A',
  highlight: '#707070',
  shadow: '#2A2A2A',
  outline: '#1A1A1A',
};

/**
 * Draws a pointed spike on top of a tower or post.
 */
function drawSpike(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  // Spike outline
  ctx.fillStyle = PALISADE_PALETTE.outline;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.lineTo(x, y - height);
  ctx.lineTo(x + width / 2, y);
  ctx.closePath();
  ctx.fill();

  // Highlight on left face
  ctx.fillStyle = PALISADE_PALETTE.highlight;
  ctx.beginPath();
  ctx.moveTo(x - width / 2 + 1, y);
  ctx.lineTo(x, y - height + 1);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Renders a gate segment in a "chunky 3D pixel art" style.
 * Supports arbitrary wall angles with 2.5D perspective.
 */
export function drawGate(
  ctx: CanvasRenderingContext2D,
  width: number, // Building width (span)
  _height: number, // Building height (unused for rendering height)
  seed: number,
  tribeColor: string,
  connections: PalisadeConnections,
) {
  // 1. Connection Fillers (World-space)
  // These fill the gaps between the gate and adjacent palisade segments.
  for (const conn of connections.connections) {
    drawPalisadeConnection(
      ctx,
      conn.distance,
      conn.angle,
      PALISADE_DEFAULT_HEIGHT,
      seed,
      connections.isInner,
      connections.isVertical,
    );
  }

  const halfW = width / 2;
  const baseY = 10; // Align base with palisade (palisade is 20px tall, centered at 0)
  const towerW = 12;
  const towerH = 44;
  const doorH = 34;
  const lintelH = 8;
  const plankW = 6;

  ctx.save();

  if (connections.isVertical) {
    // --- VERTICAL GATE (Side Profile - Strictly North-South) ---
    const doorThickness = 16;
    const gateH = 42;
    const yStart = baseY - gateH;

    if (connections.isInner) {
      // Background shadow
      ctx.fillStyle = PALISADE_INNER_SHADOW;
      ctx.fillRect(-doorThickness / 2, yStart, doorThickness, gateH);

      // Structural details (rails)
      drawPixelBlock(ctx, -doorThickness / 2, yStart + 8, doorThickness, 4, false);
      drawPixelBlock(ctx, -doorThickness / 2, yStart + gateH - 12, doorThickness, 4, false);

      // Main vertical frame posts
      drawPixelBlock(ctx, -doorThickness / 2, yStart, 4, gateH, true);
      drawPixelBlock(ctx, doorThickness / 2 - 4, yStart, 4, gateH, true);
    } else {
      // Fortified side block
      drawPixelBlock(ctx, -doorThickness / 2, yStart, doorThickness, gateH, true);

      // Tribe accent
      ctx.fillStyle = tribeColor;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(-doorThickness / 2 + 2, yStart + gateH / 3, doorThickness - 4, gateH / 3);
      ctx.globalAlpha = 1.0;
    }
  } else {
    // --- FRONT / DIAGONAL GATE ---
    // Use wallAngle to determine perspective skew
    const skew = Math.sin(connections.wallAngle) * 0.6;
    
    // Tower accent and spike dimensions (relative to tower size)
    const accentInset = 2;
    const accentYOffset = towerH / 3;
    const accentHeight = towerH / 4;
    const spikeWidth = towerW * 0.8;
    const spikeHeight = 8;

    // Helper to draw a tower
    const drawTower = (x: number) => {
      const ty = baseY + x * skew - towerH;
      if (connections.isInner) {
        ctx.fillStyle = PALISADE_INNER_SHADOW;
        ctx.fillRect(x - towerW / 2, ty, towerW, towerH);
        drawPixelBlock(ctx, x - towerW / 2, ty, 4, towerH, true);
        drawPixelBlock(ctx, x + towerW / 2 - 4, ty, 4, towerH, true);
      } else {
        drawPixelBlock(ctx, x - towerW / 2, ty, towerW, towerH, true);
        
        // Add tribe accent stripe on tower
        ctx.fillStyle = tribeColor;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x - towerW / 2 + accentInset, ty + accentYOffset, towerW - accentInset * 2, accentHeight);
        ctx.globalAlpha = 1.0;
        
        // Add spike on top of outer tower
        drawSpike(ctx, x, ty, spikeWidth, spikeHeight);
      }
    };

    // Helper to draw the gate opening (doors and lintel)
    const drawOpening = () => {
      const startX = -halfW + towerW / 2;
      const endX = halfW - towerW / 2;

      // 1. Doors (Planks)
      for (let x = startX; x < endX; x += plankW) {
        const w = Math.min(plankW, endX - x);
        const hVar = (pseudoRandom(seed + x) - 0.5) * 4;
        const curH = doorH + hVar;
        const curY = baseY + x * skew - curH;

        if (connections.isInner) {
          ctx.fillStyle = PALISADE_INNER_SHADOW;
          ctx.fillRect(x, curY, w, curH);
          // Inner rails
          drawPixelBlock(ctx, x, curY + 4, w, 4, false);
          drawPixelBlock(ctx, x, curY + curH - 10, w, 4, false);
        } else {
          drawPixelBlock(ctx, x, curY, w, curH, true);

          // Tribe Banners on doors
          if (x > -12 && x < 12) {
            ctx.fillStyle = tribeColor;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(x + 1, curY + curH / 4, w - 2, curH / 2.5);
            ctx.globalAlpha = 1.0;
          }
        }
      }

      // 2. Lintel (Top Beam)
      // Drawn as small segments to handle skew
      for (let x = startX - 2; x < endX + 2; x += 4) {
        const w = Math.min(4, endX + 2 - x);
        const ly = baseY + x * skew - doorH - lintelH;
        drawPixelBlock(ctx, x, ly, w, lintelH, false);
      }

      // 3. Metal Hinges (Outer only)
      if (!connections.isInner) {
        ctx.fillStyle = METAL_PALETTE.outline;
        for (const sideX of [startX, endX - 6]) {
          const hy1 = baseY + sideX * skew - doorH + 6;
          const hy2 = baseY + sideX * skew - 12;
          ctx.fillRect(sideX, hy1, 6, 3);
          ctx.fillRect(sideX, hy2, 6, 3);
        }
      }
    };

    // Z-Sorting: Draw the "back" tower first, then doors, then "front" tower
    if (skew > 0) {
      drawTower(halfW);
      drawOpening();
      drawTower(-halfW);
    } else {
      drawTower(-halfW);
      drawOpening();
      drawTower(halfW);
    }
  }

  ctx.restore();
}
