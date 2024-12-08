import { Santa, SantaColorTheme } from '../game-world/game-world-types';

// Pixel art color palettes
const COLORS = {
  CLASSIC: {
    HAT: '#FF0000',
    FACE: '#FFE0BD',
    BEARD: '#FFFFFF',
    SUIT: '#FF0000',
    BELT: '#4A4A4A',
    BOOTS: '#4A4A4A',
  },
  DED_MOROZ: {
    HAT: '#87CEEB', // Light blue for Ded Moroz
    FACE: '#FFE0BD',
    BEARD: '#FFFFFF',
    SUIT: '#87CEEB', // Light blue for Ded Moroz
    BELT: '#4A4A4A',
    BOOTS: '#4A4A4A',
  },
  SLEDGE: {
    BODY: '#8B4513',
    RAILS: '#A0522D',
    METAL: '#C0C0C0',
  },
} as const;

// Santa dimensions
const SANTA_SIZE = {
  WIDTH: 32,
  HEIGHT: 32,
} as const;

// Sledge dimensions
const SLEDGE_SIZE = {
  WIDTH: 48,
  HEIGHT: 24,
} as const;

/**
 * Get color palette based on Santa's theme
 */
function getColorPalette(colorTheme?: SantaColorTheme) {
  switch (colorTheme) {
    case 'dedMoroz':
      return COLORS.DED_MOROZ;
    case 'classic':
    default:
      return COLORS.CLASSIC;
  }
}

/**
 * Draw a pixel-art circle
 */
function drawPixelCircle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
) {
  ctx.fillStyle = color;

  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) {
        ctx.fillRect(Math.floor(centerX + x), Math.floor(centerY + y), 1, 1);
      }
    }
  }
}

/**
 * Draw a pixel-art rectangle
 */
function drawPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), width, height);
}

/**
 * Render Santa's hat
 */
function renderSantaHat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: 'left' | 'right',
  colorPalette: typeof COLORS.CLASSIC | typeof COLORS.DED_MOROZ,
) {
  const hatWidth = 12;
  const hatHeight = 8;
  const pompomSize = 4;

  // Hat base
  drawPixelRect(ctx, x, y, hatWidth, hatHeight, colorPalette.HAT);

  // Pompom
  drawPixelCircle(
    ctx,
    x + (direction === 'right' ? hatWidth - pompomSize / 2 : pompomSize / 2),
    y - pompomSize / 2,
    pompomSize / 2,
    colorPalette.BEARD,
  );
}

/**
 * Render Santa's face
 */
function renderSantaFace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: 'left' | 'right',
  colorPalette: typeof COLORS.CLASSIC | typeof COLORS.DED_MOROZ,
) {
  // Face
  drawPixelCircle(ctx, x + 8, y + 8, 8, colorPalette.FACE);

  // Beard
  drawPixelRect(ctx, x + 4, y + 8, 8, 8, colorPalette.BEARD);

  // Eyes
  const eyeX = x + (direction === 'right' ? 10 : 6);
  drawPixelRect(ctx, eyeX, y + 6, 2, 2, '#000000');
}

/**
 * Render Santa's body
 */
function renderSantaBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colorPalette: typeof COLORS.CLASSIC | typeof COLORS.DED_MOROZ,
) {
  // Suit
  drawPixelRect(ctx, x + 4, y + 16, 16, 12, colorPalette.SUIT);

  // Belt
  drawPixelRect(ctx, x + 4, y + 22, 16, 2, colorPalette.BELT);

  // Boots
  drawPixelRect(ctx, x + 4, y + 28, 6, 4, colorPalette.BOOTS);
  drawPixelRect(ctx, x + 14, y + 28, 6, 4, colorPalette.BOOTS);
}

/**
 * Render the sledge
 */
function renderSledge(ctx: CanvasRenderingContext2D, x: number, y: number, direction: 'left' | 'right') {
  const sledgeX = x - SLEDGE_SIZE.WIDTH / 2;
  const sledgeY = y - SLEDGE_SIZE.HEIGHT / 2;

  // Sledge body
  drawPixelRect(ctx, sledgeX, sledgeY, SLEDGE_SIZE.WIDTH, SLEDGE_SIZE.HEIGHT / 2, COLORS.SLEDGE.BODY);

  // Rails
  const railHeight = 4;
  drawPixelRect(
    ctx,
    sledgeX,
    sledgeY + SLEDGE_SIZE.HEIGHT - railHeight,
    SLEDGE_SIZE.WIDTH,
    railHeight,
    COLORS.SLEDGE.RAILS,
  );

  // Metal details
  const metalWidth = 2;
  drawPixelRect(
    ctx,
    sledgeX + (direction === 'right' ? SLEDGE_SIZE.WIDTH - metalWidth * 2 : 0),
    sledgeY + SLEDGE_SIZE.HEIGHT / 4,
    metalWidth,
    SLEDGE_SIZE.HEIGHT / 2,
    COLORS.SLEDGE.METAL,
  );
}

/**
 * Calculate animation offset based on movement
 */
function calculateAnimationOffset(santa: Santa, time: number): number {
  const moving = Math.abs(santa.vx) > 0.01 || Math.abs(santa.vy) > 0.01;
  if (!moving) return 0;

  // Create a bobbing motion when moving
  return Math.sin(time * 0.01) * 2;
}

/**
 * Main render function for Santa and sledge
 */
export function renderSanta(ctx: CanvasRenderingContext2D, santa: Santa, time: number): void {
  ctx.save();

  // Get the appropriate color palette based on Santa's theme
  const colorPalette = getColorPalette(santa.colorTheme);

  // Move to Santa's position
  ctx.translate(santa.x, santa.y);

  ctx.scale(-1, santa.direction === 'right' ? 1 : -1);

  // Apply rotation
  ctx.rotate(santa.angle);

  // Calculate animation offset
  const animOffset = calculateAnimationOffset(santa, time);

  // Draw sledge first (behind Santa)
  renderSledge(ctx, 0, animOffset, santa.direction);

  // Draw Santa centered on sledge
  const santaX = -SANTA_SIZE.WIDTH / 2;
  const santaY = -SANTA_SIZE.HEIGHT / 2 + animOffset;

  renderSantaBody(ctx, santaX, santaY, colorPalette);
  renderSantaFace(ctx, santaX, santaY, santa.direction, colorPalette);
  renderSantaHat(ctx, santaX + 4, santaY, santa.direction, colorPalette);

  ctx.restore();
}
