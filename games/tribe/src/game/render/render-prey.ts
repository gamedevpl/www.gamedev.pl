import { PreyEntity } from '../entities/characters/prey/prey-types';
import { TribePrey2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-prey-2d/tribe-prey-2d.js';

// Map prey actions to sprite stances
const preyStanceMap: Record<string, string> = {
  'grazing': 'eat',
  'moving': 'walk',
  'procreating': 'procreate',
  'idle': 'idle',
};

/**
 * Renders a prey entity using the asset generator sprite system.
 */
export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyEntity): void {
  const { position, activeAction = 'idle' } = prey;
  
  // Adjust radius based on adult status
  const currentRadius = prey.isAdult ? prey.radius : prey.radius * 0.6;
  
  const stance = preyStanceMap[activeAction] || 'idle';
  
  // Use asset generator to render the prey sprite
  TribePrey2D.render(
    ctx,
    position.x - currentRadius,
    position.y - currentRadius,
    currentRadius * 2,
    currentRadius * 2,
    prey.animationProgress || 0,
    stance,
    {
      gender: prey.gender,
      age: prey.age,
      direction: [prey.direction?.x || 1, prey.direction?.y || 0],
      isPregnant: prey.isPregnant ?? false,
      hungryLevel: prey.hunger,
      geneCode: prey.geneCode, // Use actual genetic code
    }
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

  // Flee cooldown indicator (red outline when in flee cooldown)
  if (prey.fleeCooldown && prey.fleeCooldown > 0) {
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentRadius + 2, 0, 2 * Math.PI);
    ctx.stroke();
  }
}