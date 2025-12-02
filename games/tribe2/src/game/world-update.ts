import { GameWorldState } from './world-types';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY, VIEWPORT_FOLLOW_SPEED } from './game-consts.ts';
import { interactionsUpdate } from './interactions/interactions-update';
import { entitiesUpdate } from './entities/entities-update';
import { visualEffectsUpdate } from './visual-effects/visual-effects-update';
import { findPlayerEntity } from './utils';
import { vectorLerp } from './utils/math-utils';
import { updateTutorial } from './tutorial/tutorial-utils';
import { updateNotifications } from './notifications/notification-utils';
import { indexWorldState } from './world-index/world-state-index';
import { updateEcosystemBalancer } from './ecosystem';
import { updateConstruction } from './buildings/construction-system';
import { updateProductionSystem } from './production/production-system';

const MAX_REAL_TIME_DELTA = 1 / 60; // Maximum delta time to prevent large jumps

function updateViewport(state: GameWorldState, deltaTime: number): void {
  const player = findPlayerEntity(state);
  if (player) {
    state.viewportCenter = vectorLerp(state.viewportCenter, player.position, VIEWPORT_FOLLOW_SPEED * deltaTime);
  }
}

/**
 * Handles the visual effects of active notifications, such as highlighting entities.
 * @param state The current game world state.
 */
function updateNotificationEffects(state: GameWorldState): void {
  // Reset all highlights first
  for (const entity of state.entities.entities.values()) {
    entity.isHighlighted = false;
  }

  // Apply highlights from active, non-dismissed notifications
  const activeNotifications = state.notifications.filter((n) => !n.isDismissed);
  for (const notification of activeNotifications) {
    if (notification.highlightedEntityIds) {
      for (const entityId of notification.highlightedEntityIds) {
        const entity = state.entities.entities.get(entityId);
        if (entity) {
          entity.isHighlighted = true;
        }
      }
    }
  }
}

export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  if (currentState.isPaused) {
    return currentState;
  }

  while (realDeltaTimeSeconds > 0) {
    const indexedState = indexWorldState(currentState);
    const deltaTime = Math.min(realDeltaTimeSeconds, MAX_REAL_TIME_DELTA);

    if (indexedState.gameOver) {
      return indexedState;
    }

    const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
    indexedState.time += gameHoursDelta;

    // Viewport update
    updateViewport(indexedState, deltaTime);

    // Update notifications (removes expired ones)
    updateNotifications(indexedState);

    // Update ecosystem balancer
    updateEcosystemBalancer(indexedState);

    // Update notification effects (e.g., highlighting)
    updateNotificationEffects(indexedState);

    // Update construction system
    updateConstruction(indexedState, deltaTime);

    // Update production system
    updateProductionSystem(indexedState, deltaTime);

    // Entities update
    entitiesUpdate({
      gameState: indexedState,
      deltaTime: deltaTime,
    });

    // Process entity interactions
    interactionsUpdate({ gameState: indexedState, deltaTime: deltaTime });

    // Process visual effects
    visualEffectsUpdate(indexedState);

    // Update tutorial state
    updateTutorial(indexedState, deltaTime);

    currentState = indexedState;
    realDeltaTimeSeconds -= deltaTime;
  }

  return currentState;
}
