import { Entity } from '../entities/entities-types';
import { GameWorldState } from '../world-types';
import { renderBerryBush } from './render-bush';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { renderCorpse } from './render-corpse';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { renderCharacter } from './render-character';
import { renderPrey } from './render-prey';
import { renderPredator } from './render-predator';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { findChildren, findHeir, findPlayerEntity } from '../utils';
import { renderVisualEffect } from './render-effects';
import {
  UI_NOTIFICATION_ENTITY_HIGHLIGHT_COLOR,
  UI_NOTIFICATION_ENTITY_HIGHLIGHT_LINE_WIDTH,
  UI_NOTIFICATION_ENTITY_HIGHLIGHT_PULSE_SPEED,
  UI_NOTIFICATION_ENTITY_HIGHLIGHT_RADIUS,
  UI_TUTORIAL_HIGHLIGHT_COLOR,
  UI_TUTORIAL_HIGHLIGHT_LINE_WIDTH,
  UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED,
  UI_TUTORIAL_HIGHLIGHT_RADIUS,
} from '../ui/ui-consts.ts';
import { renderEntityHighlight } from './render-highlights';
import { isEntityInView, renderWithWrapping } from './render-utils';
import { Vector2D } from '../utils/math-types';
import { renderBuilding } from './render-building.ts';
import { BuildingEntity } from '../entities/buildings/building-types.ts';
import { renderPlantingZonesMetaball } from './render-planting-zones.ts';
import { BuildingType } from '../entities/buildings/building-consts.ts';
import { renderArrow } from './render-arrow';
import { ArrowEntity } from '../entities/arrow/arrow-types';

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  isDebugOn: boolean,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
): void {
  const player = findPlayerEntity(gameState);
  const playerChildren = player ? findChildren(gameState, player) : [];
  const playerHeir = findHeir(playerChildren);

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // Render planting zones using metaball approach (before individual entities)
  // This creates smooth, organic joining of adjacent zones belonging to the same tribe
  renderPlantingZonesMetaball(ctx, gameState, viewportCenter, player?.leaderId);

  const sortedEntities = Object.values(gameState.entities.entities).sort((a, b) =>
    isDebugOn && a.id === gameState.debugCharacterId && a.id !== b.id
      ? -1
      : a.type === 'building' && b.type !== 'building'
      ? -1
      : a.position.y - b.position.y || a.id - b.id,
  );

  const visibleEntities = sortedEntities.filter((entity) =>
    isEntityInView(entity, viewportCenter, canvasDimensions, gameState.mapDimensions),
  );

  visibleEntities.forEach((entity: Entity) => {
    if (entity.type === 'building') {
      const building = entity as BuildingEntity;
      // Skip planting zones as they are rendered by metaball approach
      if (building.buildingType === BuildingType.PlantingZone && building.isConstructed) {
        return;
      }
      renderWithWrapping(ctx, worldWidth, worldHeight, renderBuilding, building, gameState, player, gameState.time);
    } else if (entity.type === 'berryBush') {
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
      const isPlayerAttackTarget = player?.attackTargetId === human.id;

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
        isPlayerAttackTarget,
        isDebugOn,
        gameState,
      );
    } else if (entity.type === 'corpse') {
      renderWithWrapping(ctx, worldWidth, worldHeight, renderCorpse, entity as CorpseEntity);
    } else if (entity.type === 'prey') {
      renderWithWrapping(
        ctx,
        worldWidth,
        worldHeight,
        renderPrey,
        entity as PreyEntity,
        isDebugOn,
        gameState.time,
        gameState.debugCharacterId,
      );
    } else if (entity.type === 'predator') {
      renderWithWrapping(
        ctx,
        worldWidth,
        worldHeight,
        renderPredator,
        entity as PredatorEntity,
        isDebugOn,
        gameState.time,
        gameState.debugCharacterId,
      );
    } else if (entity.type === 'arrow') {
      renderWithWrapping(
        ctx,
        worldWidth,
        worldHeight,
        renderArrow,
        entity as ArrowEntity,
      );
    }
  });

  const visibleVisualEffects = gameState.visualEffects.filter((effect) =>
    isEntityInView(effect, viewportCenter, canvasDimensions, gameState.mapDimensions),
  );

  visibleVisualEffects.forEach((effect) => {
    renderWithWrapping(ctx, worldWidth, worldHeight, renderVisualEffect, effect, gameState.time);
  });

  // Render notification entity highlights
  const activeNotifications = gameState.notifications.filter((n) => !n.isDismissed);
  for (const notification of activeNotifications) {
    if (notification.highlightedEntityIds && notification.renderHighlights) {
      for (const highlightedEntityId of notification.highlightedEntityIds) {
        const highlightedEntity = gameState.entities.entities[highlightedEntityId];
        if (
          highlightedEntity &&
          isEntityInView(highlightedEntity, viewportCenter, canvasDimensions, gameState.mapDimensions)
        ) {
          renderWithWrapping(
            ctx,
            worldWidth,
            worldHeight,
            renderEntityHighlight,
            highlightedEntity,
            UI_NOTIFICATION_ENTITY_HIGHLIGHT_RADIUS,
            UI_NOTIFICATION_ENTITY_HIGHLIGHT_COLOR,
            UI_NOTIFICATION_ENTITY_HIGHLIGHT_LINE_WIDTH,
            UI_NOTIFICATION_ENTITY_HIGHLIGHT_PULSE_SPEED,
            gameState.time,
          );
        }
      }
    }
  }

  // Render tutorial highlights if active
  if (gameState.tutorialState.isActive && gameState.tutorialState.highlightedEntityIds.length > 0) {
    for (const highlightedEntityId of gameState.tutorialState.highlightedEntityIds) {
      const highlightedEntity = gameState.entities.entities[highlightedEntityId];
      if (
        highlightedEntity &&
        isEntityInView(highlightedEntity, viewportCenter, canvasDimensions, gameState.mapDimensions)
      ) {
        renderWithWrapping(
          ctx,
          worldWidth,
          worldHeight,
          renderEntityHighlight,
          highlightedEntity,
          UI_TUTORIAL_HIGHLIGHT_RADIUS,
          UI_TUTORIAL_HIGHLIGHT_COLOR,
          UI_TUTORIAL_HIGHLIGHT_LINE_WIDTH,
          UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED,
          gameState.time,
        );
      }
    }
  }
}
