import { GameWorldState } from './world-types';
import { GAME_DAY_IN_REAL_SECONDS } from './world-consts';
import { HOURS_PER_GAME_DAY } from './world-consts';
import { interactionsUpdate } from './interactions/interactions-update'; // Added import
import { entitiesUpdate } from './entities/entities-update';

export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  const newState = structuredClone(currentState);

  if (newState.gameOver) {
    return newState;
  }

  const gameHoursDelta = realDeltaTimeSeconds * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
  newState.time += gameHoursDelta;

  // Entities update
  entitiesUpdate({
    gameState: newState,
    deltaTime: realDeltaTimeSeconds,
  });

  // Process entity interactions
  interactionsUpdate({ gameState: newState, deltaTime: realDeltaTimeSeconds }); // Added call

  return newState;
}
