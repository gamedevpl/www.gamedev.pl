import { Santa } from '../game-world/game-world-types';

// Pixel art color palette
const COLORS = {
  SANTA: {
    HAT: '#FF0000',
    FACE: '#FFE0BD',
    BEARD: '#FFFFFF',
    SUIT: '#FF0000',
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
function renderSantaHat(ctx: CanvasRenderingContext2D, x: number, y: number, direction: 'left' | 'right') {
  const hatWidth = 12;
  const hatHeight = 8;
  const pompomSize = 4;

  // Hat base
  drawPixelRect(ctx, x, y, hatWidth, hatHeight, COLORS.SANTA.HAT);

  // Pompom
  drawPixelCircle(
    ctx,
    x + (direction === 'right' ? hatWidth - pompomSize / 2 : pompomSize / 2),
    y - pompomSize / 2,
    pompomSize / 2,
    COLORS.SANTA.BEARD,
  );
}

/**
 * Render Santa's face
 */
function renderSantaFace(ctx: CanvasRenderingContext2D, x: number, y: number, direction: 'left' | 'right') {
  // Face
  drawPixelCircle(ctx, x + 8, y + 8, 8, COLORS.SANTA.FACE);

  // Beard
  drawPixelRect(ctx, x + 4, y + 8, 8, 8, COLORS.SANTA.BEARD);

  // Eyes
  const eyeX = x + (direction === 'right' ? 10 : 6);
  drawPixelRect(ctx, eyeX, y + 6, 2, 2, '#000000');
}

/**
 * Render Santa's body
 */
function renderSantaBody(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Suit
  drawPixelRect(ctx, x + 4, y + 16, 16, 12, COLORS.SANTA.SUIT);

  // Belt
  drawPixelRect(ctx, x + 4, y + 22, 16, 2, COLORS.SANTA.BELT);

  // Boots
  drawPixelRect(ctx, x + 4, y + 28, 6, 4, COLORS.SANTA.BOOTS);
  drawPixelRect(ctx, x + 14, y + 28, 6, 4, COLORS.SANTA.BOOTS);
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

  renderSantaBody(ctx, santaX, santaY);
  renderSantaFace(ctx, santaX, santaY, santa.direction);
  renderSantaHat(ctx, santaX + 4, santaY, santa.direction);

  ctx.restore();
}

/**
 * Render player indicator for player-controlled Santa
 */
function renderPlayerIndicator(ctx: CanvasRenderingContext2D, santa: Santa): void {
  if (!santa.isPlayer) return;

  ctx.save();

  // Draw indicator arrow above Santa
  ctx.translate(santa.x, santa.y - SANTA_SIZE.HEIGHT);

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-5, -5);
  ctx.lineTo(5, -5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Main render function that handles both Santa and any indicators
 */
export function renderSantaWithEffects(ctx: CanvasRenderingContext2D, santa: Santa, time: number): void {
  // Render the main Santa and sledge
  renderSanta(ctx, santa, time);

  // Render player indicator if needed
  renderPlayerIndicator(ctx, santa);
}