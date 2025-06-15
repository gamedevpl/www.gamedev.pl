import { GameWorldState } from './world-types';
import { HOURS_PER_GAME_DAY } from './world-consts';
import { renderBerryBush } from './render/render-bush';
import { BerryBushEntity } from './entities/plants/berry-bush/berry-bush-types';
import { Entity } from './entities/entities-types';
import { renderHumanCorpse } from './render/render-human-corpse';
import { HumanCorpseEntity } from './entities/characters/human/human-corpse-types';
import { renderCharacter } from './render/render-character';
import { HumanEntity } from './entities/characters/human/human-types';
import { findChildren, findHeir, findPlayerEntity } from './utils/world-utils';
import { renderVisualEffect } from './render/render-effects';
import { Vector2D } from './utils/math-types';
import { VisualEffect } from './visual-effects/visual-effect-types';
import { PlayerActionHint } from './ui/ui-types';
import { renderPlayerActionHints } from './render/render-ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderWithWrapping(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderFn: (ctx: CanvasRenderingContext2D, ...args: any[]) => void,
  entity: Entity | VisualEffect,
  ...args: unknown[]
): void {
  const originalPosition = { ...entity.position };

  for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
    for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
      entity.position.x = originalPosition.x + dx;
      entity.position.y = originalPosition.y + dy;
      renderFn(ctx, entity, ...args);
    }
  }

  entity.position = originalPosition;
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  isDebugOn: boolean,
  viewportCenter: Vector2D,
  playerActionHints: PlayerActionHint[],
): void {
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = '#2c5234';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.translate(ctx.canvas.width / 2 - viewportCenter.x, ctx.canvas.height / 2 - viewportCenter.y);

  if (gameState.gameOver) {
    ctx.restore(); // Restore before drawing UI
    ctx.fillStyle = 'white';
    ctx.font = '30px "Press Start 2P", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
    ctx.font = '20px "Press Start 2P", Arial';
    ctx.fillText(
      `Lineage Extinct. Generations Survived: ${gameState.generationCount}`,
      ctx.canvas.width / 2,
      ctx.canvas.height / 2 - 20,
    );
    ctx.fillText(`Cause: ${gameState.causeOfGameOver || 'Unknown'}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
    return;
  }

  const player = findPlayerEntity(gameState);
  const playerChildren = player ? findChildren(gameState, player) : [];
  const playerHeir = findHeir(playerChildren);

  const sortedEntities = Array.from(gameState.entities.entities.values()).sort((a, b) => {
    return a.position.y - b.position.y || a.id - b.id;
  });

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  sortedEntities.forEach((entity: Entity) => {
    if (entity.type === 'berryBush') {
      renderWithWrapping(
        ctx,
        worldWidth,
        worldHeight,
        renderBerryBush,
        entity as BerryBushEntity,
        gameState,
        player,
        gameState.time,
      );
    } else if (entity.type === 'human') {
      const human = entity as HumanEntity;
      const isPlayer = human.id === player?.id;
      const isPlayerChild = playerChildren.some((child) => child.id === human.id);
      const isPlayerHeir = human.id === playerHeir?.id;
      const isPlayerParent = player && (human.id === player.motherId || human.id === player.fatherId);
      const isPlayerPartner =
        player && (human.partnerIds?.includes(player.id) || player.partnerIds?.includes(human.id));
      renderWithWrapping(
        ctx,
        worldWidth,
        worldHeight,
        renderCharacter,
        human,
        isPlayer,
        isPlayerParent,
        isPlayerChild,
        isPlayerPartner,
        isPlayerHeir,
        isDebugOn,
      );
    } else if (entity.type === 'humanCorpse') {
      renderWithWrapping(ctx, worldWidth, worldHeight, renderHumanCorpse, entity as HumanCorpseEntity);
    }
  });

  gameState.visualEffects.forEach((effect) => {
    renderWithWrapping(ctx, worldWidth, worldHeight, renderVisualEffect, effect, gameState.time);
  });

  ctx.restore(); // Restore context to draw UI in fixed positions

  ctx.fillStyle = 'white';
  ctx.font = '14px "Press Start 2P", Arial';
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

  if (player) {
    ctx.fillText(`Hunger: ${Math.floor(player.hunger)}/100`, 20, lineHeight * uiLine++);
    ctx.fillText(`Berries: ${player.berries}/${player.maxBerries}`, 20, lineHeight * uiLine++);
    ctx.fillText(`Age: ${Math.floor(player.age)} years`, 20, lineHeight * uiLine++);
  }

  if (gameState.isPlayerOnAutopilot) {
    ctx.fillText('AUTOPILOT', 20, lineHeight * uiLine++);
  }

  if (gameState.isMuted) {
    ctx.fillText('MUTED', 20, lineHeight * uiLine++);
  }

  if (player && playerActionHints.length > 0) {
    renderPlayerActionHints(ctx, playerActionHints, player, viewportCenter, ctx.canvas.width, ctx.canvas.height);
  }

  if (gameState.isPaused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '33px "Press Start 2P", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', ctx.canvas.width / 2, ctx.canvas.height / 2);
  }
}
