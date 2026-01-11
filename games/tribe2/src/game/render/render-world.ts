import { Entity } from '../entities/entities-types';
import { GameWorldState } from '../world-types';
import { IndexedWorldState, Rect } from '../world-index/world-index-types';
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
import { isEntityInView, renderWithWrapping, worldToScreenCoords } from './render-utils';
import { getNightIntensity } from '../utils/time-utils';
import { Vector2D } from '../utils/math-types';
import { renderBuilding } from './render-building.ts';
import { BuildingEntity } from '../entities/buildings/building-types.ts';
import { renderPlantingZonesMetaball } from './render-planting-zones.ts';
import { BuildingType } from '../entities/buildings/building-consts.ts';
import { renderTree } from './render-tree';
import { TreeEntity } from '../entities/plants/tree/tree-types';

const VIEWPORT_QUERY_MARGIN = 200;

interface LightSource {
  position: Vector2D;
  radius: number;
  intensity: number;
}

let lightMapCanvas: HTMLCanvasElement | null = null;

/**
 * Renders the night darkness overlay with light sources cutting through it.
 */
function renderNightOverlay(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  lightSources: LightSource[],
): void {
  const intensity = getNightIntensity(gameState.time);
  if (intensity <= 0) return;

  if (!lightMapCanvas) {
    lightMapCanvas = document.createElement('canvas');
  }
  if (lightMapCanvas.width !== canvasDimensions.width || lightMapCanvas.height !== canvasDimensions.height) {
    lightMapCanvas.width = canvasDimensions.width;
    lightMapCanvas.height = canvasDimensions.height;
  }

  const lmCtx = lightMapCanvas.getContext('2d');
  if (!lmCtx) return;

  // 1. Clear and fill with darkness
  lmCtx.clearRect(0, 0, canvasDimensions.width, canvasDimensions.height);
  lmCtx.fillStyle = `rgba(0, 0, 40, ${intensity * 0.85})`;
  lmCtx.fillRect(0, 0, canvasDimensions.width, canvasDimensions.height);

  // 2. Punch holes for lights using destination-out
  lmCtx.globalCompositeOperation = 'destination-out';

  for (const light of lightSources) {
    const screenPos = worldToScreenCoords(light.position, viewportCenter, canvasDimensions, gameState.mapDimensions);

    const gradient = lmCtx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, light.radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${light.intensity})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    lmCtx.fillStyle = gradient;
    lmCtx.beginPath();
    lmCtx.arc(screenPos.x, screenPos.y, light.radius, 0, Math.PI * 2);
    lmCtx.fill();
  }

  lmCtx.globalCompositeOperation = 'source-over';

  // 3. Draw the final light map over the world
  ctx.save();
  // Reset transform to draw in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightMapCanvas, 0, 0);
  ctx.restore();
}

/**
 * Helper to add light sources for an entity, including its wrapped versions.
 */
function addWrappedLightSources(
  lightSources: LightSource[],
  pos: Vector2D,
  radius: number,
  intensity: number,
  mapDimensions: { width: number; height: number },
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
): void {
  for (let dy = -mapDimensions.height; dy <= mapDimensions.height; dy += mapDimensions.height) {
    for (let dx = -mapDimensions.width; dx <= mapDimensions.width; dx += mapDimensions.width) {
      const wrappedPos = { x: pos.x + dx, y: pos.y + dy };
      // Check if the light influence area is visible
      if (
        isEntityInView(
          { position: wrappedPos, radius: radius } as Entity,
          viewportCenter,
          canvasDimensions,
          mapDimensions,
        )
      ) {
        lightSources.push({ position: wrappedPos, radius, intensity });
      }
    }
  }
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  isDebugOn: boolean,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  borderLights: Vector2D[] = [],
): void {
  const player = findPlayerEntity(gameState);
  const playerChildren = player ? findChildren(gameState, player) : [];
  const playerHeir = findHeir(playerChildren);

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const lightSources: LightSource[] = [];

  // 1. Collect border lights (already visible positions)
  borderLights.forEach((pos) => {
    lightSources.push({ position: pos, radius: 30, intensity: 0.3 });
  });

  // Render planting zones using metaball approach (before individual entities)
  // This creates smooth, organic joining of adjacent zones belonging to the same tribe
  renderPlantingZonesMetaball(ctx, gameState, viewportCenter, player?.leaderId);

  const indexedWorld = gameState as IndexedWorldState;
  const viewportRect: Rect = {
    left: viewportCenter.x - canvasDimensions.width / 2 - VIEWPORT_QUERY_MARGIN,
    top: viewportCenter.y - canvasDimensions.height / 2 - VIEWPORT_QUERY_MARGIN,
    right: viewportCenter.x + canvasDimensions.width / 2 + VIEWPORT_QUERY_MARGIN,
    bottom: viewportCenter.y + canvasDimensions.height / 2 + VIEWPORT_QUERY_MARGIN,
  };

  const visibleEntities = [
    ...indexedWorld.search.human.byRect(viewportRect),
    ...indexedWorld.search.building.byRect(viewportRect),
    ...indexedWorld.search.berryBush.byRect(viewportRect),
    ...indexedWorld.search.tree.byRect(viewportRect),
    ...indexedWorld.search.corpse.byRect(viewportRect),
    ...indexedWorld.search.prey.byRect(viewportRect),
    ...indexedWorld.search.predator.byRect(viewportRect),
  ].sort((a, b) =>
    isDebugOn && a.id === gameState.debugCharacterId && a.id !== b.id
      ? -1
      : a.type === 'building' && b.type !== 'building'
      ? -1
      : a.position.y < b.position.y
      ? -1
      : a.position.y > b.position.y
      ? 1
      : a.id - b.id,
  );

  visibleEntities.forEach((entity: Entity) => {
    if (entity.type === 'building') {
      const building = entity as BuildingEntity;

      // 2. Collect bonfire lights - only bonfires with fuel emit light during night
      if (building.isConstructed) {
        const isBonfire = building.buildingType === BuildingType.Bonfire && (building.fuelLevel ?? 0) > 0;
        if (isBonfire) {
          addWrappedLightSources(
            lightSources,
            building.position,
            180,
            0.95,
            gameState.mapDimensions,
            viewportCenter,
            canvasDimensions,
          );
        }
      }

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
    } else if (entity.type === 'tree') {
      renderWithWrapping(ctx, worldWidth, worldHeight, renderTree, entity as TreeEntity, gameState.time);
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
        gameState,
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
        gameState,
        gameState.debugCharacterId,
      );
    }
  });

  const visibleVisualEffects = gameState.visualEffects.filter((effect) =>
    isEntityInView(effect, viewportCenter, canvasDimensions, gameState.mapDimensions),
  );

  visibleVisualEffects.forEach((effect) => {
    renderWithWrapping(ctx, worldWidth, worldHeight, renderVisualEffect, effect, gameState.time, gameState);
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

  // --- Night Overlay ---
  renderNightOverlay(ctx, gameState, viewportCenter, canvasDimensions, lightSources);
}
