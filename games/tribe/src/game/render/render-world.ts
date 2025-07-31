import { Entity } from '../entities/entities-types';
import { GameWorldState } from '../world-types';
import { VisualEffect } from '../visual-effects/visual-effect-types';
import { renderBerryBush } from './render-bush';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { renderHumanCorpse } from './render-human-corpse';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { renderCharacter } from './render-character';
import { renderPreyEntity, renderPredatorEntity } from './render-animals';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { findChildren, findHeir, findPlayerEntity } from '../utils/world-utils';
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
} from '../world-consts';
import { renderEntityHighlight } from './render-highlights';

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

export function renderWorld(ctx: CanvasRenderingContext2D, gameState: GameWorldState, isDebugOn: boolean): void {
  const player = findPlayerEntity(gameState);
  const playerChildren = player ? findChildren(gameState, player) : [];
  const playerHeir = findHeir(playerChildren);

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  const sortedEntities = Array.from(gameState.entities.entities.values()).sort(
    (a, b) => a.position.y - b.position.y || a.id - b.id,
  );

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
      const isPlayerAttackTarget = player?.attackTargetId === human.id;
      const leader = human.leaderId
        ? (gameState.entities.entities.get(human.leaderId) as HumanEntity | undefined)
        : undefined;
      const isFollower = player
        ? human.leaderId === player.id &&
          human.activeAction === 'moving' &&
          human.target === human.leaderId &&
          leader?.isCallingToFollow
        : false;

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
        isFollower,
        isDebugOn,
        gameState.time,
        gameState.debugCharacterId,
      );
    } else if (entity.type === 'humanCorpse') {
      renderWithWrapping(ctx, worldWidth, worldHeight, renderHumanCorpse, entity as HumanCorpseEntity);
    } else if (entity.type === 'prey') {
      renderWithWrapping(ctx, worldWidth, worldHeight, renderPreyEntity, entity as PreyEntity);
    } else if (entity.type === 'predator') {
      renderWithWrapping(ctx, worldWidth, worldHeight, renderPredatorEntity, entity as PredatorEntity);
    }
  });

  gameState.visualEffects.forEach((effect) => {
    renderWithWrapping(ctx, worldWidth, worldHeight, renderVisualEffect, effect, gameState.time);
  });

  // Render notification entity highlights
  const activeNotifications = gameState.notifications.filter((n) => !n.isDismissed);
  for (const notification of activeNotifications) {
    if (notification.highlightedEntityIds && notification.renderHighlights) {
      for (const highlightedEntityId of notification.highlightedEntityIds) {
        const highlightedEntity = gameState.entities.entities.get(highlightedEntityId);
        if (highlightedEntity) {
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
  if (gameState.tutorialState.isActive && gameState.tutorialState.highlightedEntityIds.size > 0) {
    for (const highlightedEntityId of gameState.tutorialState.highlightedEntityIds) {
      const highlightedEntity = gameState.entities.entities.get(highlightedEntityId);
      if (highlightedEntity) {
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
