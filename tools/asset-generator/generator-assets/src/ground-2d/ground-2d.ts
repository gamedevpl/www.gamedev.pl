import { Asset } from '../../../generator-core/src/assets-types';

/**
 * Renders a pixel art style ground tile with texture variations
 * @param ctx Canvas rendering context
 * @param x X position to render
 * @param y Y position to render
 * @param width Width of the ground
 * @param height Height of the ground
 * @param progress Animation progress (0-1)
 * @param stance Ground stance/style
 * @param direction Direction the ground faces
 */
function renderGround(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  stance: string,
) {
  // Base ground color
  const groundColor = '#8B5E3C'; // Brown

  // Render base ground
  ctx.fillStyle = groundColor;
  ctx.fillRect(x, y, width, height);

  // Add texture variations
  addGroundTexture(ctx, x, y, width, height);

  // Add top edge highlight
  addGroundEdge(ctx, x, y, width, height);

  // Add details based on stance
  if (stance === 'default') {
    addGroundDetails(ctx, x, y, width, height, progress);
  }
}

/**
 * Adds texture variation to the ground
 */
function addGroundTexture(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  // Create a grid pattern for pixel art style
  const gridSize = Math.max(width / 20, 4); // Ensure we have reasonable sized grid cells

  ctx.save();
  ctx.globalAlpha = 0.2;

  // Draw slightly darker spots randomly
  for (let i = 0; i < (width / gridSize) * 2; i++) {
    const spotX = x + Math.random() * width;
    const spotY = y + Math.random() * height;
    const spotSize = gridSize * (0.5 + Math.random() * 0.8);

    ctx.fillStyle = Math.random() > 0.5 ? '#654321' : '#A67C52';
    ctx.fillRect(Math.floor(spotX / gridSize) * gridSize, Math.floor(spotY / gridSize) * gridSize, spotSize, spotSize);
  }

  ctx.restore();
}
/**
 * Adds a highlighted edge to the top of the ground
 */
function addGroundEdge(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  // Add top edge highlight
  const edgeHeight = Math.max(height * 0.1, 3); // At least 3px for the edge

  ctx.fillStyle = '#A67C52'; // Lighter brown for highlight
  ctx.fillRect(x, y, width, edgeHeight);

  // Add a subtle darker line at the bottom of the highlight for definition
  ctx.strokeStyle = '#654321';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + edgeHeight);
  ctx.lineTo(x + width, y + edgeHeight);
  ctx.stroke();

  // Add some pixel-art style variations to the edge
  const gridSize = Math.max(width / 20, 4);
  ctx.fillStyle = '#8B5E3C'; // Base ground color

  for (let i = 0; i < width; i += gridSize) {
    if (Math.random() > 0.7) {
      const variationWidth = gridSize * (Math.random() > 0.5 ? 1 : 2);
      ctx.fillRect(x + i, y, variationWidth, edgeHeight);
    }
  }
}

/**
 * Adds details to the ground surface like small rocks, cracks, etc.
 */
function addGroundDetails(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
) {
  const gridSize = Math.max(width / 20, 4);

  // Add small rocks
  ctx.save();
  ctx.fillStyle = '#777777';

  const numRocks = Math.floor(width / gridSize / 3);
  for (let i = 0; i < numRocks; i++) {
    const rockX = x + Math.random() * width;
    const rockY = y + Math.random() * height * 0.7 + height * 0.2;
    const rockSize = gridSize * (0.3 + Math.random() * 0.4);

    // Ensure rocks align to grid for pixel art look
    const alignedX = Math.floor(rockX / gridSize) * gridSize;
    const alignedY = Math.floor(rockY / gridSize) * gridSize;

    ctx.fillRect(alignedX, alignedY, rockSize, rockSize);
  }

  // Add cracks
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 1;

  const numCracks = Math.floor(width / gridSize / 5);
  for (let i = 0; i < numCracks; i++) {
    const crackX = x + Math.random() * width;
    const crackY = y + Math.random() * height * 0.8 + height * 0.1;

    // Align to grid
    const alignedX = Math.floor(crackX / gridSize) * gridSize;
    const alignedY = Math.floor(crackY / gridSize) * gridSize;

    ctx.beginPath();
    ctx.moveTo(alignedX, alignedY);

    // Create a simple zigzag crack
    const crackLength = gridSize * (2 + Math.random() * 3);
    const segments = Math.floor(2 + Math.random() * 3);

    for (let j = 0; j < segments; j++) {
      const nextX = alignedX + (crackLength / segments) * (j + 1);
      const nextY = alignedY + (Math.random() * gridSize - gridSize / 2);
      ctx.lineTo(nextX, nextY);
    }

    ctx.stroke();
  }

  // Add subtle grass (if applicable) with animation
  if (height > 10) {
    drawGrass(ctx, x, y, width, height, progress, gridSize);
  }

  ctx.restore();
}
/**
 * Draws small grass tufts on the ground with subtle animation
 */
function drawGrass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  _height: number,
  progress: number,
  gridSize: number,
) {
  // Grass colors
  const grassColors = ['#4CAF50', '#388E3C', '#2E7D32'];

  // Add subtle grass at the top edge
  const grassCount = Math.floor(width / gridSize / 2);
  const grassHeight = gridSize * 0.8;

  for (let i = 0; i < grassCount; i++) {
    const grassX = x + i * gridSize * 2 + Math.random() * gridSize;
    // Align to grid
    const alignedX = Math.floor(grassX / gridSize) * gridSize;

    // Only draw grass on some spots
    if (Math.random() > 0.6) {
      // Pick a random grass color
      ctx.fillStyle = grassColors[Math.floor(Math.random() * grassColors.length)];

      // Calculate grass sway based on progress
      const sway = Math.sin(progress * Math.PI * 2 + i) * gridSize * 0.2;

      // Draw a simple grass tuft (2-3 blades)
      const blades = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < blades; j++) {
        const bladeX = alignedX + j * (gridSize / 3);
        const bladeOffset = sway * (0.5 + Math.random() * 0.5);

        ctx.beginPath();
        ctx.moveTo(bladeX, y + gridSize * 0.5);
        ctx.lineTo(bladeX + bladeOffset, y - grassHeight);
        ctx.lineTo(bladeX + gridSize / 4, y + gridSize * 0.5);
        ctx.fill();
      }
    }
  }
}

export const Ground2D: Asset = {
  name: 'Ground2D',
  description: `## Ground 2D

A simple 2D ground asset.

Pixel art style ground with a flat perspective, pseudo isometric.

### Stances

- **default**: Default stance, just a ground.
  
`,
  stances: ['default'],
  render: (ctx, x, y, width, height, progress, stance) => {
    renderGround(ctx, x, y, width, height, progress, stance);
  },
};
