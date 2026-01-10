import { drawPixelBlock, PALISADE_PALETTE, PalisadeConnections } from './render-palisade';
import { pseudoRandom } from './render-utils';

const METAL_PALETTE = {
  base: '#4A4A4A',
  highlight: '#707070',
  shadow: '#2A2A2A',
  outline: '#1A1A1A',
};

const INNER_WOOD_PALETTE = {
  base: '#6B4226', // Darker wood for interior shadow
  highlight: '#8B5A2B',
  shadow: '#4A2E1A',
  outline: '#2A1A0E',
};

/**
 * Renders a gate segment in a "chunky 3D pixel art" style.
 */
export function drawGate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  tribeColor: string,
  connections: PalisadeConnections,
) {
  const railHeight = 5;

  // 1. Connection Fillers (World-space)
  // Draw these before rotation so they align with world-space neighbors
  for (const conn of connections.connections) {
    ctx.save();
    ctx.rotate(conn.angle);
    // Draw rail from center towards neighbor, overlapping slightly to midpoint
    drawPixelBlock(ctx, 0, -railHeight / 2, conn.distance / 2 + 1, railHeight, false);
    ctx.restore();
  }

  // Rotate gate if connected vertically
  // A gate should rotate if it has connections and they are primarily vertical
  const isVertical = connections.connections.length > 0 && 
    connections.connections.every(c => Math.abs(Math.sin(c.angle)) > 0.7);

  if (isVertical) {
    ctx.rotate(Math.PI / 2);
  }

  const halfW = width / 2;
  const halfH = height / 2;
  const towerWidth = width * 0.25;
  const lintelHeight = 8;

  // Visual variations based on seed
  const towerHeightVar = (pseudoRandom(seed) - 0.5) * 6;
  const hingeWiggle = (pseudoRandom(seed + 1) - 0.5) * 4;

  ctx.save();

  if (connections.isInner) {
    // --- INNER STYLE (Structural Timber Frame) ---
    
    // 1. Side Towers (Timber Frames)
    // Instead of solid blocks, draw posts with gaps
    const postSize = towerWidth * 0.4;
    
    // Left Tower Frame
    drawPixelBlock(ctx, -halfW, -halfH - 4, postSize, height + 8 + towerHeightVar, true); // Outer post
    drawPixelBlock(ctx, -halfW + towerWidth - postSize, -halfH - 4, postSize, height + 8 + towerHeightVar, true); // Inner post
    // Crossbeam for tower
    drawPixelBlock(ctx, -halfW, -halfH + height/3, towerWidth, 4, false);
    
    // Right Tower Frame
    drawPixelBlock(ctx, halfW - towerWidth, -halfH - 4, postSize, height + 8 + towerHeightVar, true); // Inner post
    drawPixelBlock(ctx, halfW - postSize, -halfH - 4, postSize, height + 8 + towerHeightVar, true); // Outer post
    // Crossbeam for tower
    drawPixelBlock(ctx, halfW - towerWidth, -halfH + height/3, towerWidth, 4, false);

    // 2. Lintel (Header Beam) - Thinner/Structural
    drawPixelBlock(ctx, -halfW, -halfH - 4, width, lintelHeight - 2, false);

    // 3. Recessed Doors (Backside)
    const doorAreaX = -halfW + towerWidth + 1;
    const doorAreaW = width - towerWidth * 2 - 2;
    const doorAreaY = -halfH + lintelHeight - 2;
    const doorAreaH = height - lintelHeight + 4;

    // Darker background for interior shadow
    ctx.fillStyle = INNER_WOOD_PALETTE.shadow;
    ctx.fillRect(doorAreaX, doorAreaY, doorAreaW, doorAreaH);

    // Vertical planks (Darker)
    const plankW = doorAreaW / 4;
    for (let i = 0; i < 4; i++) {
      const plankHVar = (pseudoRandom(seed + i + 10) - 0.5) * 4;
      // Use darker palette for inner planks
      ctx.fillStyle = INNER_WOOD_PALETTE.base;
      ctx.fillRect(doorAreaX + i * plankW + 1, doorAreaY + 1, plankW - 2, doorAreaH - 2 + plankHVar);
    }

    // 4. Wooden Bracing (Z-Pattern)
    ctx.strokeStyle = INNER_WOOD_PALETTE.highlight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Left door brace
    ctx.moveTo(doorAreaX + 2, doorAreaY + 2);
    ctx.lineTo(doorAreaX + doorAreaW/2 - 2, doorAreaY + doorAreaH - 2);
    // Right door brace
    ctx.moveTo(doorAreaX + doorAreaW/2 + 2, doorAreaY + doorAreaH - 2);
    ctx.lineTo(doorAreaX + doorAreaW - 2, doorAreaY + 2);
    ctx.stroke();

    // Horizontal brace across middle
    ctx.fillStyle = INNER_WOOD_PALETTE.base;
    ctx.fillRect(doorAreaX, doorAreaY + doorAreaH/2 - 2, doorAreaW, 4);

  } else {
    // --- OUTER STYLE (Fortified) ---

    // 1. Side Towers (Massive Solid Posts)
    drawPixelBlock(ctx, -halfW, -halfH - 4, towerWidth, height + 8 + towerHeightVar, true);
    drawPixelBlock(ctx, halfW - towerWidth, -halfH - 4, towerWidth, height + 8 + towerHeightVar, true);

    // 2. Lintel (Header Beam)
    drawPixelBlock(ctx, -halfW, -halfH - 4, width, lintelHeight, false);

    // 3. Recessed Doors
    const doorAreaX = -halfW + towerWidth + 1;
    const doorAreaW = width - towerWidth * 2 - 2;
    const doorAreaY = -halfH + lintelHeight - 2;
    const doorAreaH = height - lintelHeight + 4;

    // Door Background (Recess shadow)
    ctx.fillStyle = PALISADE_PALETTE.outline;
    ctx.fillRect(doorAreaX, doorAreaY, doorAreaW, doorAreaH);

    // Vertical planks for doors
    const plankW = doorAreaW / 4;
    for (let i = 0; i < 4; i++) {
      const plankHVar = (pseudoRandom(seed + i + 20) - 0.5) * 4;
      drawPixelBlock(ctx, doorAreaX + i * plankW, doorAreaY + 1, plankW, doorAreaH - 2 + plankHVar, true);
    }

    // 4. Iron Hardware (Hinges & Handles)
    ctx.fillStyle = METAL_PALETTE.base;
    const hingeW = 6;
    const hingeH = 2;
    
    // Hinges
    const drawHinge = (x: number, y: number) => {
      ctx.fillStyle = METAL_PALETTE.outline;
      ctx.fillRect(x, y, hingeW, hingeH);
      ctx.fillStyle = METAL_PALETTE.highlight;
      ctx.fillRect(x, y, hingeW - 1, 1);
    };

    drawHinge(-halfW + towerWidth, -halfH + 12 + hingeWiggle);
    drawHinge(-halfW + towerWidth, halfH - 12 + hingeWiggle);
    drawHinge(halfW - towerWidth - hingeW, -halfH + 12 + hingeWiggle);
    drawHinge(halfW - towerWidth - hingeW, halfH - 12 + hingeWiggle);

    // Handles
    ctx.fillStyle = METAL_PALETTE.highlight;
    ctx.fillRect(-2, hingeWiggle / 2, 1, 4);
    ctx.fillRect(1, hingeWiggle / 2, 1, 4);
  }

  // 5. Tribe Accent (On Towers) - Applied to both styles
  ctx.fillStyle = tribeColor;
  ctx.globalAlpha = 0.7;
  // Left Tower Banner
  ctx.fillRect(-halfW + 2, -height / 6, towerWidth - 4, height / 3);
  // Right Tower Banner
  ctx.fillRect(halfW - towerWidth + 2, -height / 6, towerWidth - 4, height / 3);
  ctx.globalAlpha = 1.0;

  ctx.restore();
}
