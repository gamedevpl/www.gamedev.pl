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

function drawSwirlingParticles(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number, color: string) {
  const numParticles = 3;
  const orbitRadius = 15;
  const particleRadius = 3;
  const verticalOffset = -40; // Position above the head

  ctx.save();
  ctx.globalAlpha = 0.9;

  for (let i = 0; i < numParticles; i++) {
    // Each particle gets its own angle offset and speed
    const angle = (currentTime * 4 + i * (Math.PI * 2 / numParticles)) % (Math.PI * 2);
    const x = effect.position.x + Math.cos(angle) * orbitRadius;
    const y = effect.position.y + verticalOffset + Math.sin(angle) * orbitRadius * 0.5; // Oval orbit

    ctx.beginPath();
    ctx.arc(x, y, particleRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.restore();
}

export function renderVisualEffect(ctx: CanvasRenderingContext2D, effect: VisualEffect, currentTime: number): void {
  switch (effect.type) {
    case VisualEffectType.Hunger:
      drawPulsatingCircle(ctx, effect, currentTime, 'rgba(255, 165, 0, 0.7)'); // Orange
      break;
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
    case VisualEffectType.Stunned:
      drawSwirlingParticles(ctx, effect, currentTime, 'rgba(255, 255, 0, 0.9)'); // Yellow for stun
      break;
    case VisualEffectType.AttackDeflected:
      drawEmoji(ctx, effect, currentTime, '🛡️');
      break;
    case VisualEffectType.AttackResisted:
      drawEmoji(ctx, effect, currentTime, '💪');
      break;
  }
}
