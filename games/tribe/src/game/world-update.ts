import { GameWorldState } from './world-types';
import { GAME_DAY_IN_REAL_SECONDS } from './world-consts';
import { HOURS_PER_GAME_DAY } from './world-consts';
import { interactionsUpdate } from './interactions/interactions-update';
import { entitiesUpdate } from './entities/entities-update';
import { visualEffectsUpdate } from './visual-effects/visual-effects-update';
import { indexWorldState } from './world-index/world-state-index';

const MAX_REAL_TIME_DELTA = 1 / 60; // Maximum delta time to prevent large jumps

export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  while (realDeltaTimeSeconds > 0) {
    const indexedState = indexWorldState(currentState);
    const deltaTime = Math.min(realDeltaTimeSeconds, MAX_REAL_TIME_DELTA);

    if (indexedState.gameOver) {
      return indexedState;
    }

    const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
    indexedState.time += gameHoursDelta;

    // Entities update
    entitiesUpdate({
      gameState: indexedState,
      deltaTime: deltaTime,
    });

    // Process entity interactions
    interactionsUpdate({ gameState: indexedState, deltaTime: deltaTime });

    // Process visual effects
    visualEffectsUpdate(indexedState);

    currentState = indexedState;
    realDeltaTimeSeconds -= deltaTime;
  }

  return currentState;
}
