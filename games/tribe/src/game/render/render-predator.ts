import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { TribePredator2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-predator-2d/tribe-predator-2d.js';

// Map predator actions to sprite stances
const predatorStanceMap: Record<string, string> = {
  'hunting': 'attacking',
  'attacking': 'attacking',
  'eating': 'eat',
  'moving': 'walk',
  'procreating': 'procreate',
  'idle': 'idle',
};

/**
 * Renders a predator entity using the asset generator sprite system.
 */
export function renderPredator(ctx: CanvasRenderingContext2D, predator: PredatorEntity): void {
  const { position, activeAction = 'idle' } = predator;
  
  // Adjust radius based on adult status
  const currentRadius = predator.isAdult ? predator.radius : predator.radius * 0.6;
  
  const stance = predatorStanceMap[activeAction] || 'idle';
  
  // Use asset generator to render the predator sprite
  TribePredator2D.render(
    ctx,
    position.x - currentRadius,
    position.y - currentRadius,
    currentRadius * 2,
    currentRadius * 2,
    predator.animationProgress || 0,
    stance,
    {
      gender: predator.gender,
      age: predator.age,
      direction: [predator.direction?.x || 1, predator.direction?.y || 0],
      isPregnant: predator.isPregnant ?? false,
      hungryLevel: predator.hunger,
      geneCode: predator.geneCode, // Use actual genetic code
    }
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