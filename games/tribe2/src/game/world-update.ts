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
import { profiler } from './performance-profiler';

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
    profiler.start('indexWorldState');
    const indexedState = indexWorldState(currentState);
    profiler.end('indexWorldState');
    
    const deltaTime = Math.min(realDeltaTimeSeconds, MAX_REAL_TIME_DELTA);

    const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
    indexedState.time += gameHoursDelta;

    // Viewport update
    profiler.start('updateViewport');
    updateViewport(indexedState, deltaTime);
    profiler.end('updateViewport');

    // Update notifications (removes expired ones)
    profiler.start('updateNotifications');
    updateNotifications(indexedState);
    profiler.end('updateNotifications');

    // Update ecosystem balancer
    profiler.start('updateEcosystemBalancer');
    updateEcosystemBalancer(indexedState);
    profiler.end('updateEcosystemBalancer');

    // Update notification effects (e.g., highlighting)
    profiler.start('updateNotificationEffects');
    updateNotificationEffects(indexedState);
    profiler.end('updateNotificationEffects');

    // Entities update
    profiler.start('entitiesUpdate');
    entitiesUpdate({
      gameState: indexedState,
      deltaTime: deltaTime,
    });
    profiler.end('entitiesUpdate');

    // Process entity interactions
    profiler.start('interactionsUpdate');
    interactionsUpdate({ gameState: indexedState, deltaTime: deltaTime });
    profiler.end('interactionsUpdate');

    // Process visual effects
    profiler.start('visualEffectsUpdate');
    visualEffectsUpdate(indexedState);
    profiler.end('visualEffectsUpdate');

    // Update tutorial state
    profiler.start('updateTutorial');
    updateTutorial(indexedState, deltaTime);
    profiler.end('updateTutorial');

    // Update UI state
    profiler.start('updateUI');
    updateUI(indexedState, deltaTime);
    profiler.end('updateUI');

    currentState = indexedState;
    realDeltaTimeSeconds -= deltaTime;
  }

  return currentState;
}
