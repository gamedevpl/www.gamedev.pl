import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { TribePredator2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-predator-2d/tribe-predator-2d.js';
import { CHARACTER_RADIUS } from '../ui/ui-consts.ts';
import { EntityId } from '../entities/entities-types';
import { renderBehaviorTreeDebug } from './render-behavior-tree-debug';

// Map predator actions to sprite stances
const predatorStanceMap: Record<string, string> = {
  attacking: 'attacking',
  eating: 'eat',
  moving: 'walk',
  procreating: 'procreate',
  feeding: 'eat', // Feeding children uses same stance as eating
  idle: 'idle',
};

/**
 * Renders debug information for a predator entity.
 * @param ctx Canvas rendering context
 * @param predator The predator entity to render debug info for
 */
function renderPredatorDebugInfo(ctx: CanvasRenderingContext2D, predator: PredatorEntity): void {
  const { radius, position, activeAction = 'idle' } = predator;
  const stateName = predator.stateMachine?.[0] || 'N/A';
  const yOffset = predator.isAdult ? CHARACTER_RADIUS + 20 : CHARACTER_RADIUS * 0.6 + 20;

  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Action: ${activeAction}`, position.x, position.y - yOffset);
  ctx.fillText(`State: ${stateName}`, position.x, position.y - yOffset + 10);
  ctx.fillText(`HP: ${predator.hitpoints}`, position.x, position.y - yOffset + 20);
  ctx.fillText(`Hunger: ${Math.round(predator.hunger)}`, position.x, position.y - yOffset + 30);
  ctx.fillText(`Age: ${Math.round(predator.age)}`, position.x, position.y - yOffset + 40);
  ctx.restore();

  // render character radius
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Red for predator
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.closePath();
}

/**
 * Renders a predator entity using the asset generator sprite system.
 */
export function renderPredator(
  ctx: CanvasRenderingContext2D,
  predator: PredatorEntity,
  isDebugOn: boolean = false,
  currentTime: number = 0,
  debugEntityId?: EntityId,
): void {
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
    },
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
  if (
    (predator.attackCooldown && predator.attackCooldown > 0) ||
    (predator.huntCooldown && predator.huntCooldown > 0)
  ) {
    ctx.strokeStyle = '#FF8C00'; // Dark orange
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentRadius + 3, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Debug rendering
  const showDebug = isDebugOn && (debugEntityId === undefined || predator.id === debugEntityId);

  if (showDebug && predator.aiBlackboard) {
    renderBehaviorTreeDebug(ctx, predator, currentTime);
  }

  if (showDebug) {
    renderPredatorDebugInfo(ctx, predator);
  }
}
