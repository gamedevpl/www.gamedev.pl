import { GameWorldState } from './world-types';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY, VIEWPORT_FOLLOW_SPEED } from './game-consts.ts';
import { interactionsUpdate } from './interactions/interactions-update';
import { entitiesUpdate } from './entities/entities-update';
import { visualEffectsUpdate } from './visual-effects/visual-effects-update';
import { findPlayerEntity } from './utils';
import { vectorLerp } from './utils/math-utils';
import { updateTutorial } from './tutorial/tutorial-utils';
import { updateNotificationEffects, updateNotifications } from './notifications/notification-utils';
import { indexWorldState } from './world-index/world-state-index';
import { updateEcosystemBalancer } from './ecosystem';
import { saveGame } from './persistence/persistence-utils';
import { updateUI } from './ui/ui-utils.ts';
import { updateSoilRecovery } from './soil-depletion-update';

const MAX_REAL_TIME_DELTA = 1 / 60; // Maximum delta time to prevent large jumps

function updateViewport(state: GameWorldState, deltaTime: number): void {
  const player = findPlayerEntity(state);
  if (player) {
    state.viewportCenter = vectorLerp(state.viewportCenter, player.position, VIEWPORT_FOLLOW_SPEED * deltaTime);
  }
}

export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  if (currentState.isPaused) {
    return currentState;
  }

  // Autosave logic
  if (currentState.autosaveIntervalSeconds) {
    const now = Date.now();
    const timeSinceLastAutosave = now - currentState.lastAutosaveTime;
    if (timeSinceLastAutosave > currentState.autosaveIntervalSeconds * 1000) {
      saveGame(currentState);
      currentState.lastAutosaveTime = now;
    }
  }

  while (realDeltaTimeSeconds > 0) {
    const indexedState = indexWorldState(currentState);
    const deltaTime = Math.min(realDeltaTimeSeconds, MAX_REAL_TIME_DELTA);

    const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
    indexedState.time += gameHoursDelta;

    // Viewport update
    updateViewport(indexedState, deltaTime);

    // Update notifications (removes expired ones)
    updateNotifications(indexedState);

    // Update ecosystem balancer
    updateEcosystemBalancer(indexedState);

    // Update soil depletion recovery
    updateSoilRecovery(
      indexedState.soilDepletion,
      indexedState.time,
      deltaTime,
      indexedState.mapDimensions.width,
      indexedState.mapDimensions.height,
    );

    // Update notification effects (e.g., highlighting)
    updateNotificationEffects(indexedState);

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

    // Update UI state
    updateUI(indexedState);

    currentState = indexedState;
    realDeltaTimeSeconds -= deltaTime;
  }

  return currentState;
}
