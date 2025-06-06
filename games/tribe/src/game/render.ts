import { GameWorldState } from './world-types';
import { HOURS_PER_GAME_DAY } from './world-consts';
import { renderBerryBush } from './render/render-bush'; // Added import
import { BerryBushEntity } from './entities/plants/berry-bush/berry-bush-types'; // Added import
import { Entity } from './entities/entities-types'; // Added import for type casting
import { renderCharacter } from './render/render-character'; // Added import for character rendering
import { HumanEntity } from './entities/characters/human/human-types'; // Added import for HumanEntity

export function renderGame(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Background
  ctx.fillStyle = '#2c5234'; // Dark green
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (gameState.gameOver) {
    ctx.fillStyle = 'white';
    ctx.font = '30px Press Start 2P, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
    ctx.font = '20px Press Start 2P, Arial';
    ctx.fillText(
      `Lineage Extinct. Generations Survived: ${gameState.generationCount}`,
      ctx.canvas.width / 2,
      ctx.canvas.height / 2 - 20,
    );
    ctx.fillText(`Cause: ${gameState.causeOfGameOver || 'Unknown'}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
    return;
  }

  // Render entities
  gameState.entities.entities.forEach((entity: Entity) => {
    if (entity.type === 'berryBush') {
      renderBerryBush(ctx, entity as BerryBushEntity);
    } else if (entity.type === 'human') {
      renderCharacter(ctx, entity as HumanEntity);
    }
    // TODO: Implement rendering for other entity types
  });

  // Render UI
  ctx.fillStyle = 'white';
  ctx.font = '18px Press Start 2P, Arial'; // Using a common fallback
  ctx.textAlign = 'left';
  let uiLine = 1;
  const lineHeight = 22;

  ctx.fillText(`Generation: ${gameState.generationCount}`, 20, lineHeight * uiLine++);
  ctx.fillText(
    `Time: Day ${Math.floor(gameState.time / HOURS_PER_GAME_DAY)} Hour: ${(gameState.time % HOURS_PER_GAME_DAY).toFixed(
      0,
    )}`,
    20,
    lineHeight * uiLine++,
  );
  
  // Render player-specific UI if player exists
  const player = findPlayerEntity(gameState);
  if (player) {
    ctx.fillText(`Hunger: ${Math.floor(player.hunger)}/100`, 20, lineHeight * uiLine++);
    ctx.fillText(`Berries: ${player.berries}/${player.maxBerries}`, 20, lineHeight * uiLine++);
    ctx.fillText(`Age: ${Math.floor(player.age)} years`, 20, lineHeight * uiLine++);
  }
}

// Helper function to find the player entity
function findPlayerEntity(gameState: GameWorldState): HumanEntity | undefined {
  for (const entity of gameState.entities.entities.values()) {
    if (entity.isPlayer && entity.type === 'human') {
      return entity as HumanEntity;
    }
  }
  return undefined;
}