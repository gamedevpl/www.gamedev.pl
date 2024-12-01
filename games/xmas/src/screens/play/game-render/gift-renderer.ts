import { Gift } from '../game-world/game-world-types';

// Gift appearance configuration
const GIFT_CONFIG = {
  size: 30,
  colors: {
    base: '#CC2222', // Red base color
    ribbon: '#FFEB3B', // Yellow ribbon
    shadow: '#991111', // Darker red for shadow/depth
  },
  floating: {
    glowColor: 'rgba(255, 255, 255, 0.3)',
    glowRadius: 40,
  },
  grounded: {
    shadowBlur: 15,
    shadowColor: 'rgba(0, 0, 0, 0.3)',
  },
};

/**
 * Draw a gift box shape
 */
function drawGiftBox(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Draw shadow/depth effect
  ctx.fillStyle = GIFT_CONFIG.colors.shadow;
  ctx.fillRect(-size / 2 + 2, -size / 2 + 2, size, size);

  // Draw main box
  ctx.fillStyle = GIFT_CONFIG.colors.base;
  ctx.fillRect(-size / 2, -size / 2, size, size);

  // Draw ribbon
  ctx.fillStyle = GIFT_CONFIG.colors.ribbon;

  // Vertical ribbon
  ctx.fillRect(-size / 6, -size / 2, size / 3, size);

  // Horizontal ribbon
  ctx.fillRect(-size / 2, -size / 6, size, size / 3);

  // Draw bow
  const bowSize = size / 4;
  ctx.beginPath();
  ctx.arc(-bowSize / 2, -bowSize / 2, bowSize, 0, Math.PI * 2);
  ctx.arc(bowSize / 2, -bowSize / 2, bowSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw floating effect
 */
function drawFloatingEffect(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();

  // Create gradient for glow effect
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, GIFT_CONFIG.floating.glowRadius);
  gradient.addColorStop(0, GIFT_CONFIG.floating.glowColor);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  // Animate glow opacity
  const glowOpacity = 0.3 + 0.2 * Math.sin(time * 0.003);
  ctx.globalAlpha = glowOpacity;

  // Draw glow
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, GIFT_CONFIG.floating.glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw ground shadow
 */
function drawGroundShadow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();

  ctx.shadowBlur = GIFT_CONFIG.grounded.shadowBlur;
  ctx.shadowColor = GIFT_CONFIG.grounded.shadowColor;

  ctx.beginPath();
  ctx.ellipse(x, y + 2, GIFT_CONFIG.size / 2, GIFT_CONFIG.size / 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fill();

  ctx.restore();
}

/**
 * Render a single gift
 */
function renderGift(ctx: CanvasRenderingContext2D, gift: Gift, time: number) {
  ctx.save();

  switch (gift.state) {
    case 'floating':
      // Draw floating effect
      drawFloatingEffect(ctx, gift.x, gift.y, time);
      // Draw the gift with slight wobble
      drawGiftBox(ctx, gift.x, gift.y, GIFT_CONFIG.size, Math.sin(time * 0.002) * 0.1);
      break;

    case 'carried':
      // Draw the gift with santa's angle
      drawGiftBox(ctx, gift.x, gift.y, GIFT_CONFIG.size, gift.angle);
      break;

    case 'falling':
      // Draw rotating gift
      drawGiftBox(ctx, gift.x, gift.y, GIFT_CONFIG.size, gift.angle);
      break;

    case 'grounded':
      // Draw shadow under the gift
      drawGroundShadow(ctx, gift.x, gift.y);
      // Draw the gift
      drawGiftBox(ctx, gift.x, gift.y, GIFT_CONFIG.size, gift.angle);
      break;
  }

  ctx.restore();
}

/**
 * Render all gifts in the game world
 */
export function renderGifts(ctx: CanvasRenderingContext2D, gifts: Gift[], time: number) {
  // Sort gifts by y-coordinate for proper depth rendering
  const sortedGifts = [...gifts].sort((a, b) => a.y - b.y);

  // Render each gift
  sortedGifts.forEach((gift) => {
    renderGift(ctx, gift, time);
  });
}
