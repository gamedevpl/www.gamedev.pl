import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { TribePrey2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-prey-2d/tribe-prey-2d.js';
import { TribePredator2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-predator-2d/tribe-predator-2d.js';

/**
 * Renders a prey entity using the asset generator sprite system.
 */
export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyEntity): void {
  const { position, activeAction = 'idle' } = prey;
  
  // Adjust radius based on adult status
  const currentRadius = prey.isAdult ? prey.radius : prey.radius * 0.6;
  
  // Map prey actions to sprite stances
  const getPreyStance = (action: string) => {
    switch (action) {
      case 'grazing':
        return 'eat';
      case 'moving':
      case 'fleeing':
        return 'walk';
      case 'procreating':
        return 'procreate';
      case 'idle':
      default:
        return 'idle';
    }
  };
  
  const stance = getPreyStance(activeAction);
  
  // Use asset generator to render the prey sprite
  TribePrey2D.render(
    ctx,
    position.x - currentRadius,
    position.y - currentRadius,
    currentRadius * 2,
    currentRadius * 2,
    prey.animationProgress || 0,
    stance,
    prey.gender,
    prey.age,
    [prey.direction?.x || 1, prey.direction?.y || 0],
    prey.isPregnant ?? false,
    prey.hunger,
  );

  // Health bar if injured
  if (prey.hitpoints < prey.maxHitpoints) {
    const barWidth = currentRadius * 1.5;
    const barHeight = 3;
    const barX = position.x - barWidth / 2;
    const barY = position.y - currentRadius - 8;

    // Background
    ctx.fillStyle = '#555';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    const healthRatio = prey.hitpoints / prey.maxHitpoints;
    ctx.fillStyle = healthRatio > 0.5 ? '#4CAF50' : healthRatio > 0.25 ? '#FFC107' : '#F44336';
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }

  // Fleeing indicator (red outline when fleeing)
  if (prey.fleeCooldown && prey.fleeCooldown > 0) {
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentRadius + 2, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

/**
 * Renders a predator entity using the asset generator sprite system.
 */
export function renderPredator(ctx: CanvasRenderingContext2D, predator: PredatorEntity): void {
  const { position, activeAction = 'idle' } = predator;
  
  // Adjust radius based on adult status
  const currentRadius = predator.isAdult ? predator.radius : predator.radius * 0.6;
  
  // Map predator actions to sprite stances
  const getPredatorStance = (action: string) => {
    switch (action) {
      case 'hunting':
      case 'attacking':
        return 'attacking';
      case 'eating':
        return 'eat';
      case 'moving':
        return 'walk';
      case 'procreating':
        return 'procreate';
      case 'idle':
      default:
        return 'idle';
    }
  };
  
  const stance = getPredatorStance(activeAction);
  
  // Use asset generator to render the predator sprite
  TribePredator2D.render(
    ctx,
    position.x - currentRadius,
    position.y - currentRadius,
    currentRadius * 2,
    currentRadius * 2,
    predator.animationProgress || 0,
    stance,
    predator.gender,
    predator.age,
    [predator.direction?.x || 1, predator.direction?.y || 0],
    predator.isPregnant ?? false,
    predator.hunger,
  );

  // Health bar if injured
  if (predator.hitpoints < predator.maxHitpoints) {
    const barWidth = currentRadius * 1.5;
    const barHeight = 3;
    const barX = position.x - barWidth / 2;
    const barY = position.y - currentRadius - 8;

    // Background
    ctx.fillStyle = '#555';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    const healthRatio = predator.hitpoints / predator.maxHitpoints;
    ctx.fillStyle = healthRatio > 0.5 ? '#4CAF50' : healthRatio > 0.25 ? '#FFC107' : '#F44336';
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }

  // Hunting/attacking indicator (orange outline when in combat)
  if ((predator.attackCooldown && predator.attackCooldown > 0) || (predator.huntCooldown && predator.huntCooldown > 0)) {
    ctx.strokeStyle = '#FF8C00'; // Dark orange
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentRadius + 3, 0, 2 * Math.PI);
    ctx.stroke();
  }
}