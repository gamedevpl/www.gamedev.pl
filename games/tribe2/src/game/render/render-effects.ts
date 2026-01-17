import { VisualEffect, VisualEffectType } from '../visual-effects/visual-effect-types';
import { GameWorldState } from '../world-types';
import { SpriteCache } from './sprite-cache';

// Sprite cache for pre-rendered effect shapes
const effectSpriteCache = new SpriteCache(50);

/**
 * Gets or creates a cached circle sprite of the specified color and size.
 * @param color The fill color for the circle
 * @param size The diameter of the circle (sprite canvas will be size x size)
 * @returns A cached HTMLCanvasElement containing the rendered circle
 */
function getCachedCircleSprite(color: string, size: number): HTMLCanvasElement {
  const key = `circle_${color}_${size}`;

  return effectSpriteCache.getOrRender(key, size, size, (ctx) => {
    const radius = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

/**
 * Draws a cached circle sprite at the specified position with scale and alpha.
 * @param anchor 'center' (default) or 'bottom' for positioning the sprite
 */
function drawCachedSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sprite: HTMLCanvasElement,
  scaleX: number,
  scaleY: number,
  alpha: number,
  anchor: 'center' | 'bottom' = 'center',
) {
  const width = sprite.width * scaleX;
  const height = sprite.height * scaleY;
  const offsetX = x - width / 2;
  const offsetY = anchor === 'bottom' ? y - height : y - height / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, offsetX, offsetY, width, height);
  ctx.restore();
}

const EFFECT_BASE_RADIUS = 15;

function drawPulsatingCircle(
  ctx: CanvasRenderingContext2D,
  effect: VisualEffect,
  currentTime: number,
  color: string,
  maxScale: number = 1.5,
) {
  const elapsedTime = currentTime - effect.startTime;
  const progress = Math.min(elapsedTime / effect.duration, 1);

  // Fade out effect
  const opacity = 1 - progress;

  // Pulsating effect
  const pulse = Math.sin(progress * Math.PI * 2); // Two pulses over the duration
  const scale = 1 + pulse * (maxScale - 1);
  const radius = EFFECT_BASE_RADIUS * scale;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(effect.position.x, effect.position.y, Math.max(0, radius), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawExpandingRing(
  ctx: CanvasRenderingContext2D,
  effect: VisualEffect,
  currentTime: number,
  color: string,
  lineWidth: number = 2,
) {
  const elapsedTime = currentTime - effect.startTime;
  const progress = Math.min(elapsedTime / effect.duration, 1);

  const opacity = 1 - progress;
  const radius = EFFECT_BASE_RADIUS * 2 * progress;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(effect.position.x, effect.position.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function drawEmoji(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number, emoji: string) {
  const elapsedTime = currentTime - effect.startTime;
  const progress = Math.min(elapsedTime / effect.duration, 1);
  const opacity = 1 - progress;
  const yOffset = -20 * progress; // Rise up

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(emoji, effect.position.x, effect.position.y + yOffset);
  ctx.restore();
}

function drawStoneProjectile(
  ctx: CanvasRenderingContext2D,
  effect: VisualEffect,
  currentTime: number,
  gameState: GameWorldState,
) {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // Determine current target position (entity tracking or fallback)
  let currentTargetPosition = effect.targetPosition;
  if (effect.targetEntityId) {
    const targetEntity = gameState.entities.entities[effect.targetEntityId];
    if (targetEntity) {
      currentTargetPosition = targetEntity.position;
    }
  }

  if (!currentTargetPosition) return;

  const elapsedTime = currentTime - effect.startTime;
  const progress = Math.min(elapsedTime / effect.duration, 1);

  // Calculate the shortest path vector on the torus robustly.
  // We use Math.round(delta / size) to find the shortest wrap-around distance
  // regardless of how much 'effect.position' has been shifted by renderWithWrapping.
  let dx = currentTargetPosition.x - effect.position.x;
  let dy = currentTargetPosition.y - effect.position.y;

  dx = dx - Math.round(dx / worldWidth) * worldWidth;
  dy = dy - Math.round(dy / worldHeight) * worldHeight;

  const movementVector = { x: dx, y: dy };

  // Calculate current position by lerping along the shortest path
  const currentX = effect.position.x + movementVector.x * progress;
  const currentY = effect.position.y + movementVector.y * progress;

  // 1. Parabolic arc
  const arcHeight = -Math.sin(progress * Math.PI) * 40;

  ctx.save();

  // 2. Draw shadow
  ctx.beginPath();
  ctx.ellipse(currentX, currentY, 4, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fill();

  // 3. Draw the stone with arc and rotation
  ctx.translate(currentX, currentY + arcHeight);
  ctx.rotate(progress * Math.PI * 4);

  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#888';
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawFireEffect(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number) {
  const elapsedTime = currentTime - effect.startTime;
  const progress = Math.min(elapsedTime / effect.duration, 1);

  // Use intensity to scale the effect (default to 1 if not provided)
  const intensity = effect.intensity ?? 1;

  // Smooth fade-in/out curve: ramp up in first 20%, ramp down in last 30%
  let fadeCurve = 1;
  if (progress < 0.2) {
    fadeCurve = progress / 0.2; // Fade in
  } else if (progress > 0.7) {
    fadeCurve = (1 - progress) / 0.3; // Fade out
  }
  const fade = fadeCurve * intensity;

  // Slower, calmer flicker for flame height
  const flicker1 = 0.8 + 0.4 * Math.sin(currentTime * 4 + effect.id * 2.3);
  const flicker2 = 0.8 + 0.4 * Math.sin(currentTime * 5 + effect.id * 1.7);
  const flicker3 = 0.8 + 0.4 * Math.sin(currentTime * 3 + effect.id * 3.1);

  // Slower, gentler horizontal sway for the entire bonfire
  const swayX = Math.sin(currentTime * 1 + effect.id) * 2;

  // Pre-rendered sprites for each layer (64x64 base size for quality)
  const spriteSize = 64;
  const outerSprite = getCachedCircleSprite('rgba(255, 80, 0, 0.6)', spriteSize);
  const middleSprite = getCachedCircleSprite('rgba(255, 140, 0, 0.7)', spriteSize);
  const innerSprite = getCachedCircleSprite('rgba(255, 220, 120, 0.8)', spriteSize);

  // Base position (bottom-center of the flame)
  const baseX = effect.position.x + swayX;
  const baseY = effect.position.y;

  // Draw three layers of vertically stretched flames
  const layers = [
    { width: 16, height: 28 * flicker1, sprite: outerSprite, offsetX: -2 },
    { width: 16 * intensity, height: 28 * flicker1 * intensity, sprite: outerSprite, offsetX: -2 },
    { width: 14 * intensity, height: 24 * flicker2 * intensity, sprite: middleSprite, offsetX: 0 },
    { width: 10 * intensity, height: 18 * flicker3 * intensity, sprite: innerSprite, offsetX: 1 },
    { width: 14, height: 24 * flicker2, sprite: middleSprite, offsetX: 0 },
    { width: 10, height: 18 * flicker3, sprite: innerSprite, offsetX: 1 },
  ];

  for (const layer of layers) {
    const scaleX = layer.width / spriteSize;
    const scaleY = layer.height / spriteSize;
    drawCachedSprite(ctx, baseX + layer.offsetX, baseY, layer.sprite, scaleX, scaleY, fade, 'bottom');
  }

  // Draw rising sparks
  const sparkSprite = getCachedCircleSprite('rgba(255, 220, 100, 0.9)', spriteSize);
  const sparkCount = 3;
  for (let i = 0; i < sparkCount; i++) {
    const sparkProgress = (currentTime * 2 + i * 0.5 + effect.id) % 1;
    const sparkX = baseX + Math.sin(currentTime * 4 + i * 2) * 4;
    const sparkY = baseY - 20 - sparkProgress * 15;
    const sparkOpacity = (1 - sparkProgress) * fade * 0.8;
    drawCachedSprite(ctx, sparkX, sparkY, sparkSprite, 0.08, 0.08, sparkOpacity, 'center');
  }
}

function drawSmokeEffect(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number) {
  const elapsedTime = currentTime - effect.startTime;
  // Use intensity to scale the effect (default to 1 if not provided)
  const intensity = effect.intensity ?? 1;
  const progress = Math.min(elapsedTime / effect.duration, 1);

  // Smoother fade curve: ease in/out
  let fadeCurve = 1;
  if (progress < 0.15) {
    fadeCurve = progress / 0.15; // Fade in
  } else if (progress > 0.8) {
    fadeCurve = (1 - progress) / 0.2; // Fade out
  }

  // Pre-rendered smoke puff sprite (64x64 base size)
  const spriteSize = 64;
  const smokeSprite = getCachedCircleSprite('rgba(180, 180, 180, 0.7)', spriteSize);

  const puffCount = 3;
  for (let i = 0; i < puffCount; i++) {
    const offsetProgress = Math.min(progress + i * 0.2, 1);

    // Slower drift and rise for calmer smoke
    const driftX = Math.sin(currentTime * 0.8 + i * 2 + effect.id) * 6;
    const rise = offsetProgress * 25 + i * 5;
    const radius = (6 + offsetProgress * 10 + i * 2) * intensity;
    const opacity = fadeCurve * intensity * 0.7;
    const scale = (radius * 2) / spriteSize;

    // Draw using the correct cached sprite function
    drawCachedSprite(
      ctx,
      effect.position.x + driftX,
      effect.position.y - rise,
      smokeSprite,
      scale,
      scale,
      opacity,
      'center',
    );
  }
}

export function renderVisualEffect(
  ctx: CanvasRenderingContext2D,
  effect: VisualEffect,
  currentTime: number,
  gameState: GameWorldState,
): void {
  switch (effect.type) {
    case VisualEffectType.Procreation:
      drawEmoji(ctx, effect, currentTime, '❤️');
      break;
    case VisualEffectType.Pregnant:
      drawPulsatingCircle(ctx, effect, currentTime, 'rgba(255, 105, 180, 0.7)', 1.2); // Pink
      break;
    case VisualEffectType.TargetAcquired:
      drawExpandingRing(ctx, effect, currentTime, 'rgba(255, 0, 0, 0.8)', 3); // Red
      break;
    case VisualEffectType.Attack:
      drawEmoji(ctx, effect, currentTime, '⚔️');
      break;
    case VisualEffectType.Partnered:
      drawEmoji(ctx, effect, currentTime, '🤝');
      break;
    case VisualEffectType.BushClaimed:
      drawExpandingRing(ctx, effect, currentTime, 'rgba(0, 255, 0, 0.7)', 2); // Green
      break;
    case VisualEffectType.BushClaimLost:
      drawExpandingRing(ctx, effect, currentTime, 'rgba(128, 128, 128, 0.7)', 2); // Gray
      break;
    case VisualEffectType.Eating:
      drawEmoji(ctx, effect, currentTime, '🍖');
      break;
    case VisualEffectType.ChildFed:
      drawEmoji(ctx, effect, currentTime, '🍼');
      break;
    case VisualEffectType.AttackDeflected:
      drawEmoji(ctx, effect, currentTime, '🛡️');
      break;
    case VisualEffectType.AttackResisted:
      drawEmoji(ctx, effect, currentTime, '💪');
      break;
    case VisualEffectType.Hit:
      drawEmoji(ctx, effect, currentTime, '💥');
      break;
    case VisualEffectType.SeizeBuildup:
      drawExpandingRing(ctx, effect, currentTime, 'rgba(255, 215, 0, 0.8)', 4); // Gold
      break;
    case VisualEffectType.BorderClaim:
      drawEmoji(ctx, effect, currentTime, '🚩');
      break;
    case VisualEffectType.Seize:
      drawExpandingRing(ctx, effect, currentTime, 'rgba(148, 0, 211, 0.8)', 4); // Purple
      break;
    case VisualEffectType.StoneProjectile:
      drawStoneProjectile(ctx, effect, currentTime, gameState);
      break;
    case VisualEffectType.Fire:
      drawFireEffect(ctx, effect, currentTime);
      break;
    case VisualEffectType.Smoke:
      drawSmokeEffect(ctx, effect, currentTime);
      break;
  }
}
