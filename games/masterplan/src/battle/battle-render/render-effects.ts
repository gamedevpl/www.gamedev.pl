import { BattleState, Effect, EffectType } from '../battle-state/battle-state-types';
import { toIsometric } from './render-utils';

// Define effect sizes
const EFFECT_SIZE = 40;

// Define effect colors
const EFFECT_COLORS: Record<EffectType, string> = {
  damage: 'rgba(255, 0, 0, 0.5)',
  explosion: 'rgba(255, 165, 0, 0.7)',
  walk: 'rgba(0, 255, 0, 0.3)'
};

export function renderEffects(
  ctx: CanvasRenderingContext2D,
  battleState: BattleState
) {
  battleState.effects.forEach(effect => {
    renderEffect(ctx, effect, battleState.time);
  });
}

function renderEffect(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  currentTime: number
) {
  // Calculate isometric position with consideration of global transformation
  const { isoX, isoY } = toIsometric(effect.position.x, effect.position.y); // Adjust if needed for transformations
  const progress = (currentTime - effect.startTime) / (effect.endTime - effect.startTime);

  if (progress >= 0 && progress < 1) {
    ctx.save();
    ctx.translate(isoX, isoY);

    switch (effect.type) {
      case 'damage':
        renderDamageEffect(ctx, progress);
        break;
      case 'explosion':
        renderExplosionEffect(ctx, progress);
        break;
      case 'walk':
        renderWalkEffect(ctx, progress);
        break;
    }

    ctx.restore();
  }
}

function renderDamageEffect(ctx: CanvasRenderingContext2D, progress: number) {
  const size = EFFECT_SIZE * (1 - progress);
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = EFFECT_COLORS.damage;
  ctx.fill();
}

function renderExplosionEffect(ctx: CanvasRenderingContext2D, progress: number) {
  const size = EFFECT_SIZE * progress;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = EFFECT_COLORS.explosion;
  ctx.fill();

  // Add some particle effects
  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = size * Math.random();
    const particleX = Math.cos(angle) * distance;
    const particleY = Math.sin(angle) * distance;
    
    ctx.beginPath();
    ctx.arc(particleX, particleY, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
    ctx.fill();
  }
}

function renderWalkEffect(ctx: CanvasRenderingContext2D, progress: number) {
  const size = EFFECT_SIZE * (1 - progress);
  ctx.beginPath();
  ctx.ellipse(0, 0, size / 4, size / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = EFFECT_COLORS.walk;
  ctx.fill();
}