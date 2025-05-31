import { GameWorldState } from './world-types';
import { GAME_DAY_IN_REAL_SECONDS } from './world-consts';
import { HOURS_PER_GAME_DAY } from './world-consts';

export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  const newState = structuredClone(currentState);

  if (newState.gameOver) {
    return newState;
  }

  const gameHoursDelta = realDeltaTimeSeconds * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
  newState.time += gameHoursDelta;

  // TODO: Implement new state update

  return newState;
}
