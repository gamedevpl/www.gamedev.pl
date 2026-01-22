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
import { updateSoilRecovery } from './entities/plants/soil-depletion-update.ts';
import { scheduledEventsUpdate } from './scheduled-events-update';
import { checkAndExecuteTribeMerges } from './entities/tribe/family-tribe-utils';
import { updateTemperature } from './temperature/temperature-update';
import { produceTribeBuildingTasks, updateTribeFrontier } from './ai/task/tribes/tribe-building-task-producer';
import { produceTribeDiplomacyTasks } from './ai/task/tribes/tribe-diplomacy-task-producer';
import { produceTribeStrategyTasks } from './ai/task/tribes/tribe-strategy-ai';
import { cleanupExpiredTasks } from './ai/task/task-utils';
import { updateNavigationAI } from './ai/navigation-ai-update';

const MAX_REAL_TIME_DELTA = 1 / 60; // Maximum delta time to prevent large jumps

function updateViewport(state: GameWorldState, deltaTime: number): void {
  // Only follow player if the flag is set
  if (!state.cameraFollowingPlayer) {
    return;
  }

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

    // Update tasks (removes expired ones)
    cleanupExpiredTasks(indexedState);

    // Update ecosystem balancer
    updateEcosystemBalancer(indexedState);

    // Update soil depletion recovery
    updateSoilRecovery(indexedState);

    // Update world temperature
    updateTemperature(indexedState);

    // Update notification effects (e.g., highlighting)
    updateNotificationEffects(indexedState);

    // Process scheduled events (e.g. ranged impacts)
    scheduledEventsUpdate({ gameState: indexedState, deltaTime: deltaTime });

    // Entities update
    entitiesUpdate({
      gameState: indexedState,
      deltaTime: deltaTime,
    });

    // Process entity interactions
    interactionsUpdate({ gameState: indexedState, deltaTime: deltaTime });

    // Incremental frontier analysis for tribe expansion
    updateTribeFrontier({ gameState: indexedState, deltaTime });

    // Navigation AI: Process pathfinding queue and breach detection
    updateNavigationAI(indexedState);

    // Global tribe management: check for orphaned tribes and execute merges/dissolutions
    // We run this once per game hour to maintain performance and avoid UI churn
    if (Math.floor(indexedState.time) > Math.floor(indexedState.time - gameHoursDelta)) {
      checkAndExecuteTribeMerges(indexedState);
      produceTribeBuildingTasks({ gameState: indexedState, deltaTime });
      produceTribeDiplomacyTasks({ gameState: indexedState, deltaTime });
      produceTribeStrategyTasks({ gameState: indexedState, deltaTime });
    }

    // Process visual effects
    visualEffectsUpdate(indexedState);

    // Update tutorial state
    updateTutorial(indexedState, deltaTime);

    currentState = indexedState;
    realDeltaTimeSeconds -= deltaTime;
  }

  return currentState;
}
