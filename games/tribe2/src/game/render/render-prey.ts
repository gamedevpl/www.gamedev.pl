import { PreyEntity } from '../entities/characters/prey/prey-types';
import { TribePrey2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-prey-2d/tribe-prey-2d.js';
import { CHARACTER_RADIUS } from '../ui/ui-consts.ts';
import { EntityId } from '../entities/entities-types';
import { SpriteCache } from './sprite-cache';
import { snapToStep, discretizeDirection, getDiscretizedDirectionVector, renderDebugTargetHighlight } from './render-utils';
import { GameWorldState } from '../world-types';
import { CharacterEntity } from '../entities/characters/character-types';

// Map prey actions to sprite stances
const preyStanceMap: Record<string, string> = {
  grazing: 'eat',
  moving: 'walk',
  procreating: 'procreate',
  feeding: 'eat', // Feeding children uses same stance as eating
  idle: 'idle',
};

// Caching logic
const preyCache = new SpriteCache(200);

/**
 * Renders debug information for a prey entity.
 * @param ctx Canvas rendering context
 * @param prey The prey entity to render debug info for
 */
function renderPreyDebugInfo(ctx: CanvasRenderingContext2D, prey: PreyEntity, gameState: GameWorldState): void {
  const { radius, position, activeAction = 'idle' } = prey;
  const stateName = prey.stateMachine[0] || 'N/A';
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

  renderDebugTargetHighlight(ctx, prey as CharacterEntity, gameState);
}

/**
 * Renders a prey entity using the asset generator sprite system.
 */
export function renderPrey(
  ctx: CanvasRenderingContext2D,
  prey: PreyEntity,
  isDebugOn: boolean = false,
  gameState: GameWorldState,
  debugEntityId?: EntityId,
): void {
  const { position, activeAction = 'idle' } = prey;

  // Adjust radius based on adult status
  const currentRadius = prey.isAdult ? prey.radius : prey.radius * 0.6;

  const stance = preyStanceMap[activeAction] || 'idle';

  // Discretize state for caching
  const animStep = snapToStep(prey.animationProgress || 0, 12);
  const dirStep = discretizeDirection(prey.direction || { x: 1, y: 0 }, 8);
  const ageStep = Math.floor(prey.age);
  const hungerStep = snapToStep(prey.hunger / 100, 5) * 100;

  const key = `${stance}_${ageStep}_${dirStep}_${animStep}_${prey.isPregnant ?? false}_${hungerStep}_${
    prey.geneCode
  }_${currentRadius}`;
  const size = Math.ceil(currentRadius * 2) + 4;

  const sprite = preyCache.getOrRender(key, size, size, (cacheCtx) => {
    cacheCtx.translate(size / 2, size / 2);
    const discreteDir = getDiscretizedDirectionVector(dirStep, 8);
    TribePrey2D.render(cacheCtx, -size / 2 + 2, -size / 2 + 2, size - 4, size - 4, animStep, stance, {
      gender: prey.gender,
      age: ageStep,
      direction: discreteDir,
      isPregnant: prey.isPregnant ?? false,
      hungryLevel: hungerStep,
      geneCode: prey.geneCode,
    });
  });

  ctx.drawImage(sprite, position.x - sprite.width / 2, position.y - sprite.height / 2);

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

  if (showDebug) {
    renderPreyDebugInfo(ctx, prey, gameState);
  }
}
