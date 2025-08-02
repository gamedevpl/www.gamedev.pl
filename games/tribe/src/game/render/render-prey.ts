import { PreyEntity } from '../entities/characters/prey/prey-types';
import { TribePrey2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-prey-2d/tribe-prey-2d.js';
import {
  CHARACTER_RADIUS
} from '../ui-consts.ts';
import { EntityId } from '../entities/entities-types';
import { renderBehaviorTreeDebug } from './render-behavior-tree-debug';

// Map prey actions to sprite stances
const preyStanceMap: Record<string, string> = {
  grazing: 'eat',
  moving: 'walk',
  procreating: 'procreate',
  feeding: 'eat', // Feeding children uses same stance as eating
  idle: 'idle',
};

/**
 * Renders debug information for a prey entity.
 * @param ctx Canvas rendering context
 * @param prey The prey entity to render debug info for
 */
function renderPreyDebugInfo(ctx: CanvasRenderingContext2D, prey: PreyEntity): void {
  const { radius, position, activeAction = 'idle' } = prey;
  const stateName = prey.stateMachine?.[0] || 'N/A';
  const yOffset = prey.isAdult ? CHARACTER_RADIUS + 20 : CHARACTER_RADIUS * 0.6 + 20;

  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Action: ${activeAction}`, position.x, position.y - yOffset);
  ctx.fillText(`State: ${stateName}`, position.x, position.y - yOffset + 10);
  ctx.fillText(`HP: ${prey.hitpoints}`, position.x, position.y - yOffset + 20);
  ctx.fillText(`Hunger: ${Math.round(prey.hunger)}`, position.x, position.y - yOffset + 30);
  ctx.fillText(`Age: ${Math.round(prey.age)}`, position.x, position.y - yOffset + 40);
  ctx.restore();

  // render character radius
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; // Green for prey
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.closePath();
}

/**
 * Renders a prey entity using the asset generator sprite system.
 */
export function renderPrey(
  ctx: CanvasRenderingContext2D,
  prey: PreyEntity,
  isDebugOn: boolean = false,
  currentTime: number = 0,
  debugEntityId?: EntityId,
): void {
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
    },
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

  // Debug rendering
  const showDebug = isDebugOn && (debugEntityId === undefined || prey.id === debugEntityId);

  if (showDebug && prey.aiBlackboard) {
    renderBehaviorTreeDebug(ctx, prey, currentTime);
  }

  if (showDebug) {
    renderPreyDebugInfo(ctx, prey);
  }
}
