import { GameWorldState } from './world-types';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY, VIEWPORT_FOLLOW_SPEED } from './world-consts';
import { interactionsUpdate } from './interactions/interactions-update';
import { entitiesUpdate } from './entities/entities-update';
import { visualEffectsUpdate } from './visual-effects/visual-effects-update';
import { indexWorldState } from './world-index/world-state-index';
import { findPlayerEntity } from './utils/world-utils';
import { vectorLerp } from './utils/math-utils';
import { updateTutorial } from './tutorial/tutorial-utils';

const MAX_REAL_TIME_DELTA = 1 / 60; // Maximum delta time to prevent large jumps

function updateViewport(state: GameWorldState, deltaTime: number): void {
  const player = findPlayerEntity(state);
  if (player) {
    state.viewportCenter = vectorLerp(state.viewportCenter, player.position, VIEWPORT_FOLLOW_SPEED * deltaTime);
  }
}

export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
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
