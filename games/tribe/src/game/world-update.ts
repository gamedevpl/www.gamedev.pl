import { GameWorldState } from './world-types';
import { GAME_DAY_IN_REAL_SECONDS } from './world-consts';
import { HOURS_PER_GAME_DAY } from './world-consts';
import { interactionsUpdate } from './interactions/interactions-update'; // Added import
import { entitiesUpdate } from './entities/entities-update';
import { visualEffectsUpdate } from './visual-effects/visual-effects-update';

const MAX_REAL_TIME_DELTA = 0.001; // Maximum delta time to prevent large jumps

export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  while (realDeltaTimeSeconds > 0) {
    const newState = structuredClone(currentState);
    const deltaTime = Math.min(realDeltaTimeSeconds, MAX_REAL_TIME_DELTA);

    if (newState.gameOver) {
      return newState;
    }

    const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
    newState.time += gameHoursDelta;

    // Entities update
    entitiesUpdate({
      gameState: newState,
      deltaTime: deltaTime,
    });

    // Process entity interactions
    interactionsUpdate({ gameState: newState, deltaTime: deltaTime }); // Added call

    // Process visual effects
    visualEffectsUpdate(newState);

    currentState = newState;
    realDeltaTimeSeconds -= deltaTime;
  }

  return currentState;
}
