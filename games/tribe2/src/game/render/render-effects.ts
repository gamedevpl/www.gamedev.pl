import { VisualEffect, VisualEffectType } from '../visual-effects/visual-effect-types';

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

export function renderVisualEffect(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number): void {
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
    case VisualEffectType.StoneThrow:
      drawEmoji(ctx, effect, currentTime, '🪨');
      break;
  }
}
