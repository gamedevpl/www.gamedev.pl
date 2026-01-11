import { VisualEffect, VisualEffectType } from '../visual-effects/visual-effect-types';
import { GameWorldState } from '../world-types';
import { pseudoRandom } from './render-utils';

const EFFECT_BASE_RADIUS = 15;

// Fire effect constants - optimized for performance
const FIRE_PARTICLE_COUNT = 8;
const FIRE_BASE_SIZE = 4;
const FIRE_HEIGHT = 25;

// Smoke effect constants - optimized for performance
const SMOKE_PARTICLE_COUNT = 4;
const SMOKE_BASE_SIZE = 6;
const SMOKE_HEIGHT = 40;

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

/**
 * Draws a fire particle effect with flickering flames.
 * Uses procedural animation for a lively fire appearance.
 */
function drawBonfireFire(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number) {
  const elapsedTime = currentTime - effect.startTime;
  const progress = Math.min(elapsedTime / effect.duration, 1);
  // Keep fire visible throughout effect duration
  const opacity = Math.max(0, 1 - progress * 0.5);

  ctx.save();
  ctx.globalAlpha = opacity;

  // Use effect ID as base seed for consistent particle positions
  const baseSeed = effect.id * 1000;
  // Convert game time to animation time (multiply by 60 for faster animation)
  const animTime = elapsedTime * 60;

  for (let i = 0; i < FIRE_PARTICLE_COUNT; i++) {
    const particleSeed = baseSeed + i;

    // Animate particle lifetime within the effect duration - faster cycle
    const particlePhase = (animTime * 2 + pseudoRandom(particleSeed) * 2) % 1;

    // Horizontal position: centered with some spread
    const spreadX = (pseudoRandom(particleSeed + 1) - 0.5) * 15;
    const flickerX = Math.sin(animTime * 8 + i * 0.7) * 3;
    const x = effect.position.x + spreadX + flickerX;

    // Vertical position: rises up
    const y = effect.position.y - particlePhase * FIRE_HEIGHT - 5;

    // Size decreases as particle rises
    const size = FIRE_BASE_SIZE * (1 - particlePhase * 0.7) * (0.8 + pseudoRandom(particleSeed + 2) * 0.4);

    // Color gradient from yellow core to orange to red
    const colorPhase = particlePhase + pseudoRandom(particleSeed + 3) * 0.3;
    let r: number, g: number, b: number;
    if (colorPhase < 0.3) {
      // Yellow core
      r = 255;
      g = 255 - colorPhase * 200;
      b = 100 - colorPhase * 300;
    } else if (colorPhase < 0.6) {
      // Orange middle
      r = 255;
      g = 180 - (colorPhase - 0.3) * 400;
      b = 0;
    } else {
      // Red tip
      r = 255 - (colorPhase - 0.6) * 200;
      g = 60 - (colorPhase - 0.6) * 100;
      b = 0;
    }

    // Particle opacity fades as it rises
    const particleOpacity = Math.max(0, 1 - particlePhase * 1.2);

    ctx.beginPath();
    ctx.fillStyle = `rgba(${Math.max(0, Math.round(r))}, ${Math.max(0, Math.round(g))}, ${Math.max(0, Math.round(b))}, ${particleOpacity})`;
    ctx.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw core glow
  const glowSize = FIRE_BASE_SIZE * 2 + Math.sin(animTime * 5) * 2;
  const gradient = ctx.createRadialGradient(
    effect.position.x,
    effect.position.y - 5,
    0,
    effect.position.x,
    effect.position.y - 5,
    glowSize * 2,
  );
  gradient.addColorStop(0, 'rgba(255, 200, 50, 0.6)');
  gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

  ctx.beginPath();
  ctx.fillStyle = gradient;
  ctx.arc(effect.position.x, effect.position.y - 5, glowSize * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a smoke particle effect with rising, dissipating particles.
 */
function drawBonfireSmoke(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number) {
  const elapsedTime = currentTime - effect.startTime;
  const progress = Math.min(elapsedTime / effect.duration, 1);
  // Keep smoke visible throughout effect duration
  const opacity = Math.max(0, 1 - progress * 0.5);

  ctx.save();
  ctx.globalAlpha = opacity * 0.6; // Smoke is more transparent

  const baseSeed = effect.id * 2000;
  // Convert game time to animation time (multiply by 60 for faster animation)
  const animTime = elapsedTime * 60;

  for (let i = 0; i < SMOKE_PARTICLE_COUNT; i++) {
    const particleSeed = baseSeed + i;

    // Animate particle lifetime - smoke rises slower than fire
    const particlePhase = (animTime * 0.8 + pseudoRandom(particleSeed) * 3) % 1;

    // Horizontal drift: smoke drifts more than fire
    const driftX = Math.sin(animTime * 1.5 + i) * 8 + (pseudoRandom(particleSeed + 1) - 0.5) * 10;
    const x = effect.position.x + driftX;

    // Vertical position: starts above fire, rises up
    const y = effect.position.y - FIRE_HEIGHT - particlePhase * SMOKE_HEIGHT;

    // Size increases slightly as smoke expands
    const size = SMOKE_BASE_SIZE * (1 + particlePhase * 0.5) * (0.6 + pseudoRandom(particleSeed + 2) * 0.8);

    // Smoke fades out as it rises
    const particleOpacity = Math.max(0, 0.4 - particlePhase * 0.5);

    // Gray color with slight variation
    const grayValue = 80 + pseudoRandom(particleSeed + 3) * 40;

    ctx.beginPath();
    ctx.fillStyle = `rgba(${grayValue}, ${grayValue}, ${grayValue + 10}, ${particleOpacity})`;
    ctx.arc(x, y, Math.max(1, size), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
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
    case VisualEffectType.BonfireFire:
      drawBonfireFire(ctx, effect, currentTime);
      break;
    case VisualEffectType.BonfireSmoke:
      drawBonfireSmoke(ctx, effect, currentTime);
      break;
  }
}
